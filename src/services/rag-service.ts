import { RAGContext } from "../types";
import { RAGModule, createRAGModule } from "../rag";
import { Document } from "@langchain/core/documents";

export interface RAGServiceConfig {
    openAIApiKey?: string;
    topK: number;
    enableLogging: boolean;
    qdrantUrl: string;
    collectionName: string;
    lmStudioApiUrl?: string;
}

export class RAGService {
    private readonly ragModule: RAGModule;
    private readonly config: RAGServiceConfig;
    private initialized = false;

    constructor(config?: Partial<RAGServiceConfig>) {
        this.config = {
            topK: 10,
            enableLogging: false,
            qdrantUrl: "http://localhost:6333",
            collectionName: "rag_collection",
            lmStudioApiUrl: "http://localhost:1234/v1",
            ...config,
        };

        this.ragModule = createRAGModule({
            qdrant: {
                url: this.config.qdrantUrl,
                collectionName: this.config.collectionName,
            },
            lmStudioApiUrl: this.config.lmStudioApiUrl!,
        });
    }

    async initialize(documents: Document[] = []): Promise<void> {
        if (this.initialized) return;

        if (documents.length > 0) {
            await this.ragModule.initialize(documents);
        }

        this.initialized = true;
    }

    async shutdown(): Promise<void> {
        await this.ragModule.reset();
        this.initialized = false;
    }

    async processQuery(
        query: string,
        chatId: string
    ): Promise<{
        enhancedQuery: string;
        relevantContext: Document[];
        contextSummary: string;
        confidence: number;
    }> {
        this.ensureInitialized();

        const relevantContextResults = await this.ragModule.getRelevantContext(
            chatId,
            query,
            this.config.topK
        );

        if (relevantContextResults.length === 0) {
            return {
                enhancedQuery: query,
                relevantContext: [],
                contextSummary: "",
                confidence: 0.5,
            };
        }

        const relevantContext = relevantContextResults.map((r) => r.document);
        const contextSummary = relevantContext
            .map((doc) => doc.pageContent)
            .join(" | ")
            .substring(0, 1000);

        return {
            enhancedQuery: query,
            relevantContext,
            contextSummary,
            confidence: relevantContext.length > 0 ? 0.8 : 0.3,
        };
    }

    async addContext(
        chatId: string,
        content: string,
        metadata: Record<string, unknown> = {}
    ): Promise<void> {
        this.ensureInitialized();

        const document = new Document({
            pageContent: content,
            metadata: {
                ...metadata,
                chatId,
                addedAt: new Date().toISOString(),
            },
        });

        await this.ragModule.addContext(chatId, document);
    }

    async getRelevantContext(
        chatId: string,
        query: string,
        topK: number = 10
    ): Promise<RAGContext[]> {
        this.ensureInitialized();

        const results = await this.ragModule.getRelevantContext(
            chatId,
            query,
            topK
        );

        return results.map((result) => ({
            id: result.document.metadata?.id || Math.random().toString(36),
            content: result.document.pageContent,
            metadata: result.document.metadata || {},
            timestamp: new Date(
                result.document.metadata?.addedAt || Date.now()
            ),
        }));
    }

    async storeQueryResult(
        query: string,
        result: string,
        confidence: number,
        chatId: string,
        metadata?: Record<string, unknown>
    ): Promise<void> {
        await this.addContext(chatId, `Query: ${query}\nResult: ${result}`, {
            ...metadata,
            confidence,
            type: "query_result",
        });
    }

    async clearContext(chatId: string): Promise<void> {
        this.ensureInitialized();
        await this.ragModule.clearContext(chatId);
    }

    async getAllContext(chatId: string): Promise<RAGContext[]> {
        this.ensureInitialized();

        const documents = this.ragModule.getAllDocumentsForChat(chatId);
        return documents.map((doc) => ({
            id: doc.metadata?.id || Math.random().toString(36),
            content: doc.pageContent,
            metadata: doc.metadata || {},
            timestamp: new Date(doc.metadata?.addedAt || Date.now()),
        }));
    }

    async summarizeContext(chatId: string): Promise<string> {
        const contexts = await this.getAllContext(chatId);

        if (contexts.length === 0) {
            return "";
        }

        const sortedContexts = contexts.sort(
            (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
        );

        const recentContexts = sortedContexts.slice(0, 5);
        const summary = recentContexts.map((ctx) => ctx.content).join(" | ");

        return summary.substring(0, 1000);
    }

    async analyzeQuery(query: string): Promise<{
        complexity: "simple" | "moderate" | "complex";
        type: "factual" | "analytical" | "comparative" | "procedural";
        suggestedStrategy: string;
        estimatedTokens: number;
    }> {
        const wordCount = query.split(/\s+/).length;
        const hasQuestions = query.includes("?");
        const hasComparisons =
            /\b(vs|versus|compared to|better than|worse than)\b/i.test(query);
        const hasSteps = /\b(step|first|then|next|finally|how to)\b/i.test(
            query
        );

        let complexity: "simple" | "moderate" | "complex" = "simple";
        if (wordCount > 20) complexity = "complex";
        else if (wordCount > 10) complexity = "moderate";

        let type: "factual" | "analytical" | "comparative" | "procedural" =
            "factual";
        if (hasComparisons) type = "comparative";
        else if (hasSteps) type = "procedural";
        else if (hasQuestions && wordCount > 5) type = "analytical";

        return {
            complexity,
            type,
            suggestedStrategy: `Use ${type} approach with ${complexity} processing`,
            estimatedTokens: wordCount * 1.5,
        };
    }

    async findSimilarContexts(
        content: string,
        chatId: string,
        threshold: number = 0.7
    ): Promise<Array<{ context: RAGContext; similarity: number }>> {
        const contexts = await this.getAllContext(chatId);

        return contexts
            .map((context) => ({
                context,
                similarity: this.calculateSimilarity(content, context.content),
            }))
            .filter((item) => item.similarity >= threshold);
    }

    private calculateSimilarity(text1: string, text2: string): number {
        const words1 = text1.toLowerCase().split(/\s+/);
        const words2 = text2.toLowerCase().split(/\s+/);

        const intersection = words1.filter((word) => words2.includes(word));
        const union = Array.from(new Set([...words1, ...words2]));

        return intersection.length / union.length;
    }

    getMemoryStats(): {
        totalChats: number;
        totalDocuments: number;
        initialized: boolean;
    } {
        const stats = this.ragModule.getStatistics();

        return {
            totalChats: stats.chatContextCount,
            totalDocuments: stats.totalDocuments,
            initialized: this.initialized,
        };
    }

    cleanupExpiredContexts(): void {
        this.ragModule.reset();
    }

    updateConfig(newConfig: Partial<RAGServiceConfig>): void {
        Object.assign(this.config, newConfig);
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
                "RAGService is not initialized. Call initialize() first."
            );
        }
    }

    async healthCheck(): Promise<{
        status: "healthy" | "degraded" | "unhealthy";
        components: {
            ragModule: boolean;
            contextStore: boolean;
        };
        memoryUsage: any;
        errors: string[];
    }> {
        const errors: string[] = [];
        const components = {
            ragModule: true,
            contextStore: true,
        };

        try {
            const healthStatus = await this.ragModule.getHealthStatus();
            components.ragModule = healthStatus.status === "healthy";
            if (healthStatus.status !== "healthy") {
                errors.push(`RAG Module: ${healthStatus.status}`);
            }
        } catch (error) {
            components.ragModule = false;
            errors.push(`RAG Module: ${error}`);
        }

        const memoryUsage = this.getMemoryStats();

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
