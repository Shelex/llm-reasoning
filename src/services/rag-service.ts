import { LMStudioClient } from "./lm-studio-client";
import { RAGContext } from "../types";
import {
    SemanticContextManager,
    SemanticContext,
    ContextFilter,
    ContextRanking,
} from "../rag/semantic";
import { ContextRank } from "../rag/context-rank";
import { Deduplicator } from "../rag/deduplicator";
import { QueryProcessor, QueryProcessingResult } from "../rag/query";
import { MemoryManager, MemoryStats } from "../rag/memory";
import { EmbeddingsClient } from "../rag/embeddings";

export interface RAGServiceConfig {
    enableSemanticDeduplication: boolean;
    enableAdvancedFiltering: boolean;
    enableQueryEnhancement: boolean;
    enableMemoryManagement: boolean;
    enableLogging: boolean;
    maxContextAge: number;
    maxContextsPerChat: number;
    confidenceThreshold: number;
}

export class RAGService {
    private readonly embeddingsClient: EmbeddingsClient;
    private readonly contextManager: SemanticContextManager;
    private readonly contextRank: ContextRank;
    private readonly deduplicator: Deduplicator;
    private readonly queryProcessor: QueryProcessor;
    private readonly memoryManager: MemoryManager;
    private readonly config: RAGServiceConfig;

    private initialized = false;
    private cleanupInterval?: NodeJS.Timeout;

    constructor(llmClient: LMStudioClient, config?: Partial<RAGServiceConfig>) {
        this.config = {
            enableSemanticDeduplication: true,
            enableAdvancedFiltering: true,
            enableQueryEnhancement: true,
            enableMemoryManagement: true,
            enableLogging: true,
            maxContextAge: 30 * 60 * 1000,
            maxContextsPerChat: 15,
            confidenceThreshold: 0.6,
            ...config,
        };

        this.embeddingsClient = new EmbeddingsClient(llmClient);
        this.contextManager = new SemanticContextManager(llmClient);
        this.contextRank = new ContextRank(this.embeddingsClient);
        this.deduplicator = new Deduplicator(this.embeddingsClient, llmClient);
        this.queryProcessor = new QueryProcessor(
            this.contextManager,
            this.contextRank,
            this.deduplicator,
            llmClient
        );
        this.memoryManager = new MemoryManager({
            maxContextsPerChat: this.config.maxContextsPerChat,
            maxContextAgeDays:
                this.config.maxContextAge / (24 * 60 * 60 * 1000),
            cleanupIntervalMs: 10 * 60 * 1000,
        });

        console.log(
            "🚀 [RAG] Service initialized with advanced semantic capabilities"
        );
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            console.log("[RAG] Initializing service components...");

            console.log("[RAG] Checking embeddings service availability...");
            const isEmbeddingsHealthy =
                await this.embeddingsClient.healthCheck();
            if (!isEmbeddingsHealthy) {
                throw new Error(
                    "Embeddings service is not available. Please start LM Studio with an embedding model loaded before starting the application."
                );
            }

            console.log("[RAG] Embeddings service is healthy and ready");

            if (this.config.enableMemoryManagement) {
                this.startCleanupProcess();
            }

            this.initialized = true;
            console.log("✅ [RAG] Service initialization complete");
        } catch (error) {
            console.error("❌ [RAG] Initialization failed:", error);
            throw new Error(`RAG service initialization failed: ${error}`);
        }
    }

    async shutdown(): Promise<void> {
        console.log("🛑 [RAG] Shutting down service...");

        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }

        this.memoryManager.shutdown();
        this.embeddingsClient.clearCache();
        this.deduplicator.clearCaches();

        this.initialized = false;
        console.log("✅ [RAG] Service shutdown complete");
    }

    async processQuery(
        query: string,
        chatId: string,
        customFilter?: ContextFilter,
        customRanking?: ContextRanking
    ): Promise<QueryProcessingResult> {
        this.ensureInitialized();

        console.log(
            `🔍 [RAG] Processing query for chat ${chatId}: ${query.substring(
                0,
                100
            )}...`
        );

        try {
            const result = await this.queryProcessor.processQuery(
                query,
                chatId,
                customFilter,
                customRanking
            );

            if (this.config.enableLogging) {
                console.log(
                    `📊 [RAG] Query processed - Confidence: ${result.confidence.toFixed(
                        3
                    )}, Contexts: ${result.relevantContext.length}, Time: ${
                        result.processingStats.processingTimeMs
                    }ms`
                );
            }

            return result;
        } catch (error) {
            console.error("❌ [RAG] Query processing failed:", error);

            return {
                enhancedQuery: query,
                relevantContext: [],
                contextSummary: "",
                confidence: 0.5,
                processingStats: {
                    originalQueryLength: query.length,
                    enhancedQueryLength: query.length,
                    contextsRetrieved: 0,
                    contextCompressionRatio: 0,
                    processingTimeMs: 0,
                },
            };
        }
    }

    async addContext(
        chatId: string,
        content: string,
        contextType: SemanticContext["contextType"] = "query_result",
        confidence: number = 0.8,
        metadata: Record<string, unknown> = {}
    ): Promise<void> {
        this.ensureInitialized();

        try {
            console.log(
                `📝 [RAG] Adding context for chat ${chatId}: ${content.substring(
                    0,
                    100
                )}...`
            );

            await this.contextManager.addContext(
                chatId,
                content,
                contextType,
                confidence,
                {
                    ...metadata,
                    addedAt: new Date().toISOString(),
                    serviceVersion: "production-v1",
                }
            );

            if (this.config.enableLogging) {
                console.log(
                    `✅ [RAG] Context added successfully for chat ${chatId}`
                );
            }
        } catch (error) {
            console.error("❌ [RAG] Failed to add context:", error);
            throw error;
        }
    }

    async getRelevantContext(
        chatId: string,
        query: string,
        topK: number = 10
    ): Promise<RAGContext[]> {
        this.ensureInitialized();

        try {
            console.log(
                `🔍 [RAG] Retrieving relevant context for chat ${chatId}`
            );

            const semanticContexts =
                await this.contextManager.getRelevantContext(
                    chatId,
                    query,
                    { minConfidence: this.config.confidenceThreshold },
                    {},
                    topK
                );

            const ragContexts: RAGContext[] = semanticContexts.map((ctx) => ({
                id: ctx.id,
                content: ctx.content,
                metadata: {
                    ...ctx.metadata,
                    confidence: ctx.confidence,
                    contextType: ctx.contextType,
                    relevanceScore: ctx.relevanceScore,
                    semanticHash: ctx.semanticHash,
                },
                timestamp: ctx.timestamp,
            }));

            if (this.config.enableLogging) {
                console.log(
                    `📊 [RAG] Retrieved ${ragContexts.length} relevant contexts`
                );
            }

            return ragContexts;
        } catch (error) {
            console.error("❌ [RAG] Context retrieval failed:", error);
            return [];
        }
    }

    async storeQueryResult(
        query: string,
        result: string,
        confidence: number,
        chatId: string,
        metadata?: Record<string, unknown>
    ): Promise<void> {
        this.ensureInitialized();

        try {
            await this.queryProcessor.storeQueryResult(
                query,
                result,
                confidence,
                chatId,
                metadata
            );
        } catch (error) {
            console.error("❌ [RAG] Failed to store query result:", error);
            throw error;
        }
    }

    async clearContext(chatId: string): Promise<void> {
        this.ensureInitialized();

        try {
            console.log(`🧹 [RAG] Clearing context for chat ${chatId}`);

            await this.contextManager.clearContext(chatId);

            if (this.config.enableLogging) {
                console.log(`✅ [RAG] Context cleared for chat ${chatId}`);
            }
        } catch (error) {
            console.error("❌ [RAG] Failed to clear context:", error);
            throw error;
        }
    }

    async getAllContext(chatId: string): Promise<RAGContext[]> {
        this.ensureInitialized();

        try {
            const allContexts = await this.contextManager.getRelevantContext(
                chatId,
                "",
                { minConfidence: 0 },
                {},
                1000
            );

            return allContexts.map((ctx) => ({
                id: ctx.id,
                content: ctx.content,
                metadata: {
                    ...ctx.metadata,
                    confidence: ctx.confidence,
                    contextType: ctx.contextType,
                },
                timestamp: ctx.timestamp,
            }));
        } catch (error) {
            console.error("❌ [RAG] Failed to get all context:", error);
            return [];
        }
    }

    async summarizeContext(chatId: string): Promise<string> {
        this.ensureInitialized();

        try {
            const contexts = await this.getAllContext(chatId);

            if (contexts.length === 0) {
                return "";
            }

            const sortedContexts = contexts.sort(
                (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
            );

            const recentContexts = sortedContexts.slice(0, 5);
            const summary = recentContexts
                .map((ctx) => ctx.content)
                .join(" | ");

            return summary.substring(0, 1000);
        } catch (error) {
            console.error("❌ [RAG] Context summarization failed:", error);
            return "";
        }
    }

    async analyzeQuery(query: string): Promise<{
        complexity: "simple" | "moderate" | "complex";
        type: "factual" | "analytical" | "comparative" | "procedural";
        suggestedStrategy: string;
        estimatedTokens: number;
    }> {
        this.ensureInitialized();
        return this.queryProcessor.analyzeQuery(query);
    }

    async findSimilarContexts(
        content: string,
        chatId: string,
        threshold: number = 0.7
    ): Promise<Array<{ context: RAGContext; similarity: number }>> {
        this.ensureInitialized();

        try {
            const contexts = await this.getAllContext(chatId);
            const semanticContexts: SemanticContext[] = contexts.map((ctx) => ({
                id: ctx.id,
                content: ctx.content,
                embedding: [],
                semanticHash: "",
                confidence: (ctx.metadata.confidence as number) || 0.5,
                contextType:
                    (ctx.metadata
                        .contextType as SemanticContext["contextType"]) ||
                    "query_result",
                metadata: ctx.metadata,
                timestamp: ctx.timestamp,
            }));

            const similar = await this.deduplicator.findSimilarContexts(
                content,
                semanticContexts,
                threshold
            );

            return similar.map((item) => ({
                context: {
                    id: item.context.id,
                    content: item.context.content,
                    metadata: item.context.metadata,
                    timestamp: item.context.timestamp,
                },
                similarity: item.similarity,
            }));
        } catch (error) {
            console.error("❌ [RAG] Similar context search failed:", error);
            return [];
        }
    }

    getMemoryStats(): MemoryStats & {
        embeddingCacheStats: any;
        deduplicationStats: any;
        contextStats: any;
    } {
        this.ensureInitialized();

        const baseStats = this.memoryManager.getMemoryStats(new Map());

        return {
            ...baseStats,
            embeddingCacheStats: this.embeddingsClient.getCacheStats(),
            deduplicationStats: this.deduplicator.getCacheStats(),
            contextStats: this.contextManager.getContextStats(),
        };
    }

    cleanupExpiredContexts(): void {
        this.ensureInitialized();

        console.log("🧹 [RAG] Running manual context cleanup");
        this.contextManager.cleanupExpiredContexts();
    }

    updateConfig(newConfig: Partial<RAGServiceConfig>): void {
        Object.assign(this.config, newConfig);
        console.log("🔧 [RAG] Configuration updated");
    }

    getConfig(): RAGServiceConfig {
        return { ...this.config };
    }

    async processQueryWithEnhancedRAG(
        chatId: string,
        query: string
    ): Promise<{
        enhancedQuery: string;
        relevantContext: string;
        confidence: number;
    }> {
        const result = await this.processQuery(query, chatId);

        return {
            enhancedQuery: result.enhancedQuery,
            relevantContext: result.contextSummary,
            confidence: result.confidence,
        };
    }

    private ensureInitialized(): void {
        if (!this.initialized) {
            throw new Error(
                "ProductionRAGService is not initialized. Call initialize() first."
            );
        }
    }

    private startCleanupProcess(): void {
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredContexts();
        }, 10 * 60 * 1000); // Every 10 minutes

        console.log("⏰ [RAG] Cleanup process started");
    }

    async healthCheck(): Promise<{
        status: "healthy" | "degraded" | "unhealthy";
        components: {
            embeddings: boolean;
            contextManager: boolean;
            deduplicator: boolean;
            queryProcessor: boolean;
            memoryManager: boolean;
        };
        memoryUsage: any;
        errors: string[];
    }> {
        const errors: string[] = [];
        const components = {
            embeddings: true,
            contextManager: true,
            deduplicator: true,
            queryProcessor: true,
            memoryManager: true,
        };

        try {
            await this.embeddingsClient.generateEmbedding("test");
        } catch (error) {
            components.embeddings = false;
            errors.push(`Embeddings: ${error}`);
        }

        let memoryUsage = {};
        try {
            memoryUsage = this.getMemoryStats();
        } catch (error) {
            errors.push(`Memory stats: ${error}`);
        }

        const healthyComponents =
            Object.values(components).filter(Boolean).length;
        const totalComponents = Object.keys(components).length;

        let status: "healthy" | "degraded" | "unhealthy" = "healthy";
        if (healthyComponents < totalComponents) {
            status =
                healthyComponents > totalComponents * 0.5
                    ? "degraded"
                    : "unhealthy";
        }

        return {
            status,
            components,
            memoryUsage,
            errors,
        };
    }
}
