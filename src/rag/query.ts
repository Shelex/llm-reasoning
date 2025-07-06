import {
    SemanticContextManager,
    SemanticContext,
    ContextFilter,
    ContextRanking,
} from "./semantic";
import { ContextRank } from "./context-rank";
import { Deduplicator } from "./deduplicator";
import { LMStudioClient } from "../services/lm-studio-client";

export interface QueryProcessingResult {
    enhancedQuery: string;
    relevantContext: SemanticContext[];
    contextSummary: string;
    confidence: number;
    processingStats: {
        originalQueryLength: number;
        enhancedQueryLength: number;
        contextsRetrieved: number;
        contextCompressionRatio: number;
        processingTimeMs: number;
    };
}

export interface QueryConfig {
    enableContextEnhancement: boolean;
    maxContextLength: number;
    contextWindowTokens: number;
    enhancementStrategy: "minimal" | "balanced" | "comprehensive";
    confidenceThreshold: number;
    maxRelevantContexts: number;
}

export class QueryProcessor {
    private readonly contextManager: SemanticContextManager;
    private readonly filterRanker: ContextRank;
    private readonly deduplicator: Deduplicator;
    private readonly llmClient: LMStudioClient;
    private readonly config: QueryConfig;

    constructor(
        contextManager: SemanticContextManager,
        filterRanker: ContextRank,
        deduplicator: Deduplicator,
        llmClient: LMStudioClient,
        config?: Partial<QueryConfig>
    ) {
        this.contextManager = contextManager;
        this.filterRanker = filterRanker;
        this.deduplicator = deduplicator;
        this.llmClient = llmClient;
        this.config = {
            enableContextEnhancement: true,
            maxContextLength: 2000,
            contextWindowTokens: 8000,
            enhancementStrategy: "balanced",
            confidenceThreshold: 0.6,
            maxRelevantContexts: 8,
            ...config,
        };
    }

    async processQuery(
        query: string,
        chatId: string,
        customFilter?: ContextFilter,
        customRanking?: ContextRanking
    ): Promise<QueryProcessingResult> {
        const startTime = Date.now();
        console.log(
            `🚀 [QUERY-PROCESSOR] Processing query for chat ${chatId}: ${query.substring(
                0,
                100
            )}...`
        );

        try {
            const relevantContexts = await this.retrieveRelevantContexts(
                query,
                chatId,
                customFilter,
                customRanking
            );

            const contextSummary = await this.createContextSummary(
                relevantContexts,
                query,
                chatId
            );

            const enhancedQuery = this.config.enableContextEnhancement
                ? await this.enhanceQueryWithContext(
                      query,
                      contextSummary,
                      chatId
                  )
                : query;

            const confidence = this.calculateProcessingConfidence(
                query,
                relevantContexts,
                contextSummary
            );

            const processingTime = Date.now() - startTime;

            const result: QueryProcessingResult = {
                enhancedQuery,
                relevantContext: relevantContexts,
                contextSummary,
                confidence,
                processingStats: {
                    originalQueryLength: query.length,
                    enhancedQueryLength: enhancedQuery.length,
                    contextsRetrieved: relevantContexts.length,
                    contextCompressionRatio:
                        contextSummary.length > 0
                            ? contextSummary.length /
                              relevantContexts.reduce(
                                  (sum, ctx) => sum + ctx.content.length,
                                  0
                              )
                            : 0,
                    processingTimeMs: processingTime,
                },
            };

            console.log(
                `✅ [QUERY-PROCESSOR] Query processed successfully in ${processingTime}ms`
            );
            return result;
        } catch (error) {
            console.error("Query processing failed:", error);

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
                    processingTimeMs: Date.now() - startTime,
                },
            };
        }
    }

    async storeQueryResult(
        originalQuery: string,
        result: string,
        confidence: number,
        chatId: string,
        metadata?: Record<string, unknown>
    ): Promise<void> {
        console.log(
            `💾 [QUERY-PROCESSOR] Storing query result for chat ${chatId}`
        );

        try {
            const existingContexts =
                await this.contextManager.getRelevantContext(
                    chatId,
                    originalQuery,
                    { minSimilarity: 0.7 },
                    {},
                    5
                );

            const deduplicationResult =
                await this.deduplicator.checkDuplication(
                    result,
                    existingContexts,
                    chatId
                );

            if (!deduplicationResult.isDuplicate) {
                await this.contextManager.addContext(
                    chatId,
                    result,
                    "query_result",
                    confidence,
                    {
                        ...metadata,
                        originalQuery,
                        queryLength: originalQuery.length,
                        resultLength: result.length,
                        processingTimestamp: new Date().toISOString(),
                    }
                );
                console.log(`✅ [QUERY-PROCESSOR] New query result stored`);
            } else {
                console.log(
                    `🔄 [QUERY-PROCESSOR] Duplicate result detected, skipping storage`
                );
            }
        } catch (error) {
            console.error("Failed to store query result:", error);
        }
    }

    private async retrieveRelevantContexts(
        query: string,
        chatId: string,
        customFilter?: ContextFilter,
        customRanking?: ContextRanking
    ): Promise<SemanticContext[]> {
        console.log(
            `🔍 [QUERY-PROCESSOR] Retrieving relevant contexts for query`
        );

        const strategy = this.determineRetrievalStrategy(query);

        const filter: ContextFilter = {
            maxAge: this.getMaxAgeForStrategy(strategy),
            minConfidence: this.config.confidenceThreshold,
            ...customFilter,
        };

        const ranking: ContextRanking = {
            semanticWeight: this.getSemanticWeightForStrategy(strategy),
            confidenceWeight: 0.3,
            recencyWeight: 0.2,
            typeWeight: 0.15,
            ...customRanking,
        };

        const contexts = await this.contextManager.getRelevantContext(
            chatId,
            query,
            filter,
            ranking,
            this.config.maxRelevantContexts * 2
        );

        if (!contexts.length) {
            return [];
        }

        const queryEmbedding = await this.contextManager.getEmbeddingsClient().generateEmbedding(query);

        const filteredContexts = await this.filterRanker.filterAndRank(
            contexts,
            queryEmbedding,
            strategy,
            filter,
            this.config.maxRelevantContexts
        );

        const diverseContexts = await this.filterRanker.diversityFilter(
            filteredContexts,
            0.8
        );

        console.log(
            `📊 [QUERY-PROCESSOR] Context retrieval: ${diverseContexts.length} final contexts from ${contexts.length} candidates`
        );
        return diverseContexts;
    }

    private async createContextSummary(
        contexts: SemanticContext[],
        query: string,
        chatId: string
    ): Promise<string> {
        if (contexts.length === 0) {
            return "";
        }

        console.log(
            `📝 [QUERY-PROCESSOR] Creating context summary from ${contexts.length} contexts`
        );

        const sortedContexts = contexts.sort(
            (a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0)
        );

        let combinedContent = "";
        let totalLength = 0;

        for (const context of sortedContexts) {
            const contextWithMeta = `[${
                context.contextType
            }, confidence: ${context.confidence.toFixed(2)}] ${
                context.content
            }`;

            if (
                totalLength + contextWithMeta.length <=
                this.config.maxContextLength
            ) {
                combinedContent += combinedContent
                    ? " | " + contextWithMeta
                    : contextWithMeta;
                totalLength += contextWithMeta.length;
            } else {
                break;
            }
        }

        if (
            combinedContent.length > this.config.maxContextLength * 0.8 ||
            this.config.enhancementStrategy === "comprehensive"
        ) {
            return await this.compressContextWithLLM(
                combinedContent,
                query,
                chatId
            );
        }

        return combinedContent;
    }

    private async compressContextWithLLM(
        contextContent: string,
        query: string,
        chatId: string
    ): Promise<string> {
        const prompt = `Summarize this context information to be most relevant for answering the given question. Focus on key facts and insights that directly relate to the query.

Question: "${query}"

Context: "${contextContent}"

Requirements:
- Extract only information directly relevant to the question
- Maintain factual accuracy
- Keep response under 400 words
- Prioritize recent and high-confidence information
- Use concise, clear language

Relevant context summary:`;

        try {
            const response = await this.llmClient.queryLLM(
                prompt,
                0.2,
                chatId,
                "context_compression"
            );

            return response.content.trim();
        } catch (error) {
            console.error("Context compression failed:", error);
            return contextContent.substring(0, this.config.maxContextLength);
        }
    }

    private async enhanceQueryWithContext(
        query: string,
        contextSummary: string,
        chatId: string
    ): Promise<string> {
        if (!contextSummary || contextSummary.length < 20) {
            return query;
        }
        console.log(`🔧 [QUERY-PROCESSOR] Enhancing query with context`);

        switch (this.config.enhancementStrategy) {
            case "minimal":
                return this.minimalQueryEnhancement(query, contextSummary);

            case "comprehensive":
                return await this.comprehensiveQueryEnhancement(
                    query,
                    contextSummary,
                    chatId
                );

            case "balanced":
            default:
                return await this.balancedQueryEnhancement(
                    query,
                    contextSummary,
                    chatId
                );
        }
    }

    private minimalQueryEnhancement(
        query: string,
        contextSummary: string
    ): string {
        const enhanced = `${query}\n\nRelevant context: ${contextSummary}`;

        if (enhanced.length > this.config.contextWindowTokens * 4) {
            const maxContextLength =
                this.config.contextWindowTokens * 4 - query.length - 50;
            const truncatedContext = contextSummary.substring(
                0,
                maxContextLength
            );
            return `${query}\n\nRelevant context: ${truncatedContext}`;
        }

        return enhanced;
    }

    private async balancedQueryEnhancement(
        query: string,
        contextSummary: string,
        chatId: string
    ): Promise<string> {
        const prompt = `Enhance this query with relevant context information to make it more specific and informative, while keeping it concise.

Original query: "${query}"
Available context: "${contextSummary}"

Requirements:
- Integrate the most relevant context naturally into the query
- Maintain the original query intent
- Keep the enhanced query under 300 words
- Make it more specific and informative
- Don't add unnecessary complexity

Enhanced query:`;

        try {
            const response = await this.llmClient.queryLLM(
                prompt,
                0.3,
                chatId,
                "query_enhancement"
            );

            const enhanced = response.content.trim();

            if (
                enhanced.length > this.config.contextWindowTokens * 2 ||
                enhanced.length < query.length
            ) {
                return this.minimalQueryEnhancement(query, contextSummary);
            }

            return enhanced;
        } catch (error) {
            console.error("Query enhancement failed:", error);
            return this.minimalQueryEnhancement(query, contextSummary);
        }
    }

    private async comprehensiveQueryEnhancement(
        query: string,
        contextSummary: string,
        chatId: string
    ): Promise<string> {
        const prompt = `Create a comprehensive, context-rich query that incorporates all relevant background information to enable the most accurate and complete response.

Original query: "${query}"
Available context: "${contextSummary}"

Requirements:
- Include all relevant context that could impact the answer
- Structure the enhanced query clearly with background information
- Specify constraints or requirements based on context
- Make assumptions explicit based on available information
- Ensure the query is complete and self-contained

Comprehensive enhanced query:`;

        try {
            const response = await this.llmClient.queryLLM(
                prompt,
                0.2,
                chatId,
                "comprehensive_enhancement"
            );

            return response.content.trim();
        } catch (error) {
            console.error("Comprehensive enhancement failed:", error);
            return this.balancedQueryEnhancement(query, contextSummary, chatId);
        }
    }

    private determineRetrievalStrategy(query: string): string {
        const queryLower = query.toLowerCase();

        if (
            queryLower.includes("what is") ||
            queryLower.includes("define") ||
            queryLower.includes("explain") ||
            queryLower.includes("describe")
        ) {
            return "fact_focused";
        }

        if (
            queryLower.includes("recent") ||
            queryLower.includes("latest") ||
            queryLower.includes("current") ||
            queryLower.includes("now")
        ) {
            return "recent_focus";
        }

        if (
            queryLower.includes("exactly") ||
            queryLower.includes("precise") ||
            queryLower.includes("specific") ||
            queryLower.includes("accurate")
        ) {
            return "high_precision";
        }

        return "comprehensive";
    }

    private getMaxAgeForStrategy(strategy: string): number {
        switch (strategy) {
            case "recent_focus":
                return 15 * 60 * 1000;
            case "high_precision":
                return 20 * 60 * 1000;
            case "fact_focused":
                return 30 * 60 * 1000;
            case "comprehensive":
                return 45 * 60 * 1000;
            default:
                return 30 * 60 * 1000;
        }
    }

    private getSemanticWeightForStrategy(strategy: string): number {
        switch (strategy) {
            case "high_precision":
                return 0.5;
            case "fact_focused":
                return 0.4;
            case "recent_focus":
                return 0.3;
            case "comprehensive":
                return 0.35;
            default:
                return 0.35;
        }
    }

    private calculateProcessingConfidence(
        query: string,
        contexts: SemanticContext[],
        contextSummary: string
    ): number {
        let confidence = 0.5;

        if (contexts.length > 0) {
            confidence += 0.2;

            const avgContextConfidence =
                contexts.reduce((sum, ctx) => sum + ctx.confidence, 0) /
                contexts.length;
            confidence += avgContextConfidence * 0.2;

            const avgRelevance =
                contexts.reduce(
                    (sum, ctx) => sum + (ctx.relevanceScore ?? 0),
                    0
                ) / contexts.length;
            confidence += avgRelevance * 0.1;
        }

        if (contextSummary.length > 100) {
            confidence += 0.1;
        }

        return Math.min(confidence, 1.0);
    }

    updateConfig(newConfig: Partial<QueryConfig>): void {
        Object.assign(this.config, newConfig);
        console.log("🔧 [QUERY-PROCESSOR] Configuration updated");
    }

    getConfig(): QueryConfig {
        return { ...this.config };
    }

    async analyzeQuery(query: string): Promise<{
        complexity: "simple" | "moderate" | "complex";
        type: "factual" | "analytical" | "comparative" | "procedural";
        suggestedStrategy: string;
        estimatedTokens: number;
    }> {
        const words = query.split(" ").length;
        const chars = query.length;

        const estimatedTokens = Math.ceil(chars / 4);

        let complexity: "simple" | "moderate" | "complex" = "simple";
        if (
            words > 20 ||
            query.includes("compare") ||
            query.includes("analyze")
        ) {
            complexity = "complex";
        } else if (
            words > 10 ||
            query.includes("explain") ||
            query.includes("how")
        ) {
            complexity = "moderate";
        }

        let type: "factual" | "analytical" | "comparative" | "procedural" =
            "factual";
        if (
            query.includes("compare") ||
            query.includes("versus") ||
            query.includes("vs")
        ) {
            type = "comparative";
        } else if (
            query.includes("analyze") ||
            query.includes("evaluate") ||
            query.includes("assess")
        ) {
            type = "analytical";
        } else if (
            query.includes("how to") ||
            query.includes("steps") ||
            query.includes("process")
        ) {
            type = "procedural";
        }

        return {
            complexity,
            type,
            suggestedStrategy: this.determineRetrievalStrategy(query),
            estimatedTokens,
        };
    }
}
