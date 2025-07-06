import { EmbeddingsClient } from "./embeddings";
import { LMStudioClient } from "../services/lm-studio-client";
import { RAGContext } from "../types";

export interface SemanticContext extends RAGContext {
    embedding: number[];
    semanticHash: string;
    relevanceScore?: number;
    confidence: number;
    contextType:
        | "query_result"
        | "subtask_result"
        | "decomposition"
        | "synthesis"
        | "user_input";
}

export interface ContextFilter {
    minSimilarity?: number;
    minConfidence?: number;
    maxAge?: number;
    contextTypes?: string[];
    metadata?: Record<string, any>;
}

export interface ContextRanking {
    semanticWeight?: number;
    confidenceWeight?: number;
    recencyWeight?: number;
    typeWeight?: number;
}

export class SemanticContextManager {
    private readonly embeddingsClient: EmbeddingsClient;
    private readonly llmClient: LMStudioClient;
    private readonly contexts = new Map<string, SemanticContext[]>();
    private readonly seenHashes = new Set<string>();
    private readonly contentEmbeddings = new Map<string, number[]>();

    private readonly maxContextsPerChat = 15;
    private readonly maxContextAge = 45 * 60 * 1000;
    private readonly duplicateThreshold = 0.85;
    private readonly maxContentLength = 1000;

    constructor(llmClient: LMStudioClient) {
        this.llmClient = llmClient;
        this.embeddingsClient = new EmbeddingsClient(llmClient);
    }

    getEmbeddingsClient(): EmbeddingsClient {
        return this.embeddingsClient;
    }

    async addContext(
        chatId: string,
        content: string,
        contextType: SemanticContext["contextType"],
        confidence: number = 0.8,
        metadata: Record<string, unknown> = {}
    ): Promise<void> {
        console.log(
            `📝 [SEMANTIC] Adding ${contextType} context for chat ${chatId}: ${content.substring(
                0,
                100
            )}...`
        );

        const cleanedContent = this.cleanContent(content);
        if (cleanedContent.length < 10) {
            console.log(
                `⚠️ [SEMANTIC] Content too short, skipping: ${cleanedContent}`
            );
            return;
        }

        const embedding = await this.embeddingsClient.generateEmbedding(
            cleanedContent
        );
        const semanticHash = await this.generateSemanticHash(cleanedContent);

        if (await this.isDuplicate(chatId, cleanedContent, embedding)) {
            console.log(
                `🔄 [SEMANTIC] Duplicate content detected, updating existing context`
            );
            await this.updateExistingContext(
                chatId,
                cleanedContent,
                confidence,
                metadata
            );
            return;
        }

        const additionalInfo = await this.extractAdditionalInfo(
            chatId,
            cleanedContent
        );
        if (!additionalInfo || additionalInfo.trim().length < 20) {
            console.log(
                `📋 [SEMANTIC] No additional information found, skipping`
            );
            return;
        }

        const context: SemanticContext = {
            id: `${chatId}-${Date.now()}-${Math.random()
                .toString(36)
                .substring(2, 11)}`,
            content: additionalInfo,
            embedding,
            semanticHash,
            confidence,
            contextType,
            metadata: {
                ...metadata,
                originalLength: content.length,
                processedLength: additionalInfo.length,
                compressionRatio:
                    content.length > 0
                        ? additionalInfo.length / content.length
                        : 0,
            },
            timestamp: new Date(),
        };

        if (!this.contexts.has(chatId)) {
            this.contexts.set(chatId, []);
        }

        const chatContexts = this.contexts.get(chatId)!;
        chatContexts.push(context);
        this.seenHashes.add(semanticHash);
        this.contentEmbeddings.set(context.id, embedding);

        await this.maintainContextLimits(chatId);

        console.log(
            `✅ [SEMANTIC] Added context for chat ${chatId} (confidence: ${confidence})`
        );
    }

    async getRelevantContext(
        chatId: string,
        query: string,
        filter: ContextFilter = {},
        ranking: ContextRanking = {},
        topK: number = 5
    ): Promise<SemanticContext[]> {
        console.log(
            `🔍 [SEMANTIC] Getting relevant context for chat ${chatId}, query: ${query.substring(
                0,
                50
            )}...`
        );

        const chatContexts = this.contexts.get(chatId) || [];
        if (chatContexts.length === 0) {
            console.log(`❌ [SEMANTIC] No contexts found for chat ${chatId}`);
            return [];
        }

        const queryEmbedding = await this.embeddingsClient.generateEmbedding(
            query
        );

        const filteredContexts = this.applyFilters(chatContexts, filter);
        console.log(
            `🔍 [SEMANTIC] Filtered contexts: ${filteredContexts.length}/${chatContexts.length}`
        );

        if (filteredContexts.length === 0) {
            return [];
        }

        const scoredContexts = await this.calculateRelevanceScores(
            filteredContexts,
            queryEmbedding,
            ranking
        );

        // sort by relevance and return top K
        const relevantContexts = scoredContexts
            .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
            .slice(0, topK);

        console.log(
            `✅ [SEMANTIC] Retrieved ${relevantContexts.length} relevant contexts for chat ${chatId}`
        );
        return relevantContexts;
    }

    async compareAndStoreAdditional(
        chatId: string,
        newContent: string,
        existingContexts: SemanticContext[],
        contextType: SemanticContext["contextType"],
        confidence: number = 0.8
    ): Promise<void> {
        const existingContent = existingContexts
            .map((ctx) => ctx.content)
            .join(" ");
        const additionalInfo = await this.extractAdditionalInfo(
            chatId,
            newContent,
            existingContent
        );

        if (additionalInfo && additionalInfo.trim().length > 20) {
            await this.addContext(
                chatId,
                additionalInfo,
                contextType,
                confidence
            );
        }
    }

    private async isDuplicate(
        chatId: string,
        content: string,
        embedding: number[]
    ): Promise<boolean> {
        const semanticHash = await this.generateSemanticHash(content);

        if (this.seenHashes.has(semanticHash)) {
            return true;
        }

        const chatContexts = this.contexts.get(chatId) || [];
        for (const context of chatContexts) {
            const similarity = this.embeddingsClient.calculateCosineSimilarity(
                embedding,
                context.embedding
            );

            if (similarity >= this.duplicateThreshold) {
                console.log(
                    `🔄 [SEMANTIC] High similarity detected: ${similarity.toFixed(
                        3
                    )}`
                );
                return true;
            }
        }

        return false;
    }

    private async updateExistingContext(
        chatId: string,
        content: string,
        confidence: number,
        metadata: Record<string, unknown>
    ): Promise<void> {
        const chatContexts = this.contexts.get(chatId) || [];
        const embedding = await this.embeddingsClient.generateEmbedding(
            content
        );

        let mostSimilar: SemanticContext | null = null;
        let highestSimilarity = 0;

        for (const context of chatContexts) {
            const similarity = this.embeddingsClient.calculateCosineSimilarity(
                embedding,
                context.embedding
            );

            if (similarity > highestSimilarity) {
                highestSimilarity = similarity;
                mostSimilar = context;
            }
        }

        if (mostSimilar && highestSimilarity >= this.duplicateThreshold) {
            if (confidence > mostSimilar.confidence) {
                mostSimilar.confidence = confidence;
                mostSimilar.metadata = { ...mostSimilar.metadata, ...metadata };
                mostSimilar.timestamp = new Date();
                console.log(
                    `🔄 [SEMANTIC] Updated existing context confidence: ${confidence}`
                );
            }
        }
    }

    private async extractAdditionalInfo(
        chatId: string,
        newContent: string,
        existingContent?: string
    ): Promise<string> {
        if (!existingContent) {
            const chatContexts = this.contexts.get(chatId) || [];
            existingContent = chatContexts.map((ctx) => ctx.content).join(" ");
        }

        if (!existingContent || existingContent.trim().length === 0) {
            return this.cleanContent(newContent);
        }

        const prompt = `Compare these two pieces of information and extract only the NEW, ADDITIONAL information from the second piece that is not already covered in the first piece.

Existing information: "${existingContent}"
New information: "${newContent}"

Requirements:
- Extract only genuinely new facts, insights, or details
- Ignore redundant or duplicate information
- Focus on substantive additions, not minor variations
- Keep extracted information concise and factual
- If no meaningful additional information exists, respond with "NONE"
- Do not include explanations or reasoning

Additional information:`;

        try {
            const response = await this.llmClient.queryLLM(
                prompt,
                0.1,
                chatId,
                "extract_additional_info"
            );

            const result = response.content.trim();
            if (result.toUpperCase() === "NONE" || result.length < 10) {
                return "";
            }

            return this.cleanContent(result);
        } catch (error) {
            console.error("Failed to extract additional info:", error);
            return this.cleanContent(newContent);
        }
    }

    private applyFilters(
        contexts: SemanticContext[],
        filter: ContextFilter
    ): SemanticContext[] {
        return contexts.filter((context) => {
            if (filter.maxAge) {
                const age = Date.now() - context.timestamp.getTime();
                if (age > filter.maxAge) return false;
            }

            if (
                filter.minConfidence &&
                context.confidence < filter.minConfidence
            ) {
                return false;
            }

            if (
                filter.contextTypes &&
                !filter.contextTypes.includes(context.contextType)
            ) {
                return false;
            }

            if (filter.metadata) {
                for (const [key, value] of Object.entries(filter.metadata)) {
                    if (context.metadata[key] !== value) {
                        return false;
                    }
                }
            }

            return true;
        });
    }

    private async calculateRelevanceScores(
        contexts: SemanticContext[],
        queryEmbedding: number[],
        ranking: ContextRanking
    ): Promise<SemanticContext[]> {
        const weights = {
            semantic: ranking.semanticWeight ?? 0.4,
            confidence: ranking.confidenceWeight ?? 0.2,
            recency: ranking.recencyWeight ?? 0.2,
            type: ranking.typeWeight ?? 0.2,
        };

        const now = Date.now();
        const typeScores = {
            query_result: 1.0,
            subtask_result: 0.9,
            synthesis: 0.8,
            decomposition: 0.7,
            user_input: 0.6,
        };

        return contexts.map((context) => {
            const semanticScore =
                this.embeddingsClient.calculateCosineSimilarity(
                    queryEmbedding,
                    context.embedding
                );

            const confidenceScore = context.confidence;

            const age = now - context.timestamp.getTime();
            const recencyScore = Math.exp(-age / this.maxContextAge);

            const typeScore = typeScores[context.contextType] || 0.5;

            const relevanceScore =
                weights.semantic * semanticScore +
                weights.confidence * confidenceScore +
                weights.recency * recencyScore +
                weights.type * typeScore;

            return {
                ...context,
                relevanceScore,
            };
        });
    }

    private async maintainContextLimits(chatId: string): Promise<void> {
        const chatContexts = this.contexts.get(chatId) || [];

        if (chatContexts.length <= this.maxContextsPerChat) {
            return;
        }

        const now = Date.now();
        chatContexts.sort((a, b) => {
            const scoreA =
                a.confidence *
                Math.exp(-(now - a.timestamp.getTime()) / this.maxContextAge);
            const scoreB =
                b.confidence *
                Math.exp(-(now - b.timestamp.getTime()) / this.maxContextAge);
            return scoreB - scoreA;
        });

        const toRemove = chatContexts.splice(this.maxContextsPerChat);

        for (const context of toRemove) {
            this.seenHashes.delete(context.semanticHash);
            this.contentEmbeddings.delete(context.id);
        }

        console.log(
            `🧹 [SEMANTIC] Removed ${toRemove.length} low-relevance contexts for chat ${chatId}`
        );
    }

    private cleanContent(content: string): string {
        return content
            .replace(/\s+/g, " ")
            .replace(/[^\w\s.,!?\-:;]/g, " ")
            .trim()
            .substring(0, this.maxContentLength);
    }

    private async generateSemanticHash(content: string): Promise<string> {
        const normalized = content.toLowerCase().replace(/\s+/g, " ").trim();

        let hash = 0;
        for (let i = 0; i < normalized.length; i++) {
            const char = normalized.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // convert to 32bit integer
        }

        return hash.toString(36);
    }

    async clearContext(chatId: string): Promise<void> {
        const chatContexts = this.contexts.get(chatId) || [];

        for (const context of chatContexts) {
            this.seenHashes.delete(context.semanticHash);
            this.contentEmbeddings.delete(context.id);
        }

        this.contexts.delete(chatId);
        console.log(`🧹 [SEMANTIC] Cleared all contexts for chat ${chatId}`);
    }

    getContextStats(chatId?: string): {
        totalChats: number;
        totalContexts: number;
        avgContextsPerChat: number;
        cacheStats: any;
        chatSpecific?: {
            contexts: number;
            avgConfidence: number;
            avgAge: number;
        };
    } {
        const totalChats = this.contexts.size;
        const totalContexts = Array.from(this.contexts.values()).reduce(
            (sum, contexts) => sum + contexts.length,
            0
        );
        const avgContextsPerChat =
            totalChats > 0 ? totalContexts / totalChats : 0;

        const stats = {
            totalChats,
            totalContexts,
            avgContextsPerChat,
            cacheStats: this.embeddingsClient.getCacheStats(),
        };

        if (chatId) {
            const chatContexts = this.contexts.get(chatId) || [];
            const now = Date.now();

            const avgConfidence =
                chatContexts.length > 0
                    ? chatContexts.reduce(
                          (sum, ctx) => sum + ctx.confidence,
                          0
                      ) / chatContexts.length
                    : 0;

            const avgAge =
                chatContexts.length > 0
                    ? chatContexts.reduce(
                          (sum, ctx) => sum + (now - ctx.timestamp.getTime()),
                          0
                      ) / chatContexts.length
                    : 0;

            (stats as any).chatSpecific = {
                contexts: chatContexts.length,
                avgConfidence: Math.round(avgConfidence * 1000) / 1000,
                avgAge: Math.round(avgAge / 1000), // seconds
            };
        }

        return stats;
    }

    cleanupExpiredContexts(): void {
        const now = Date.now();
        let totalRemoved = 0;

        for (const [chatId, contexts] of this.contexts.entries()) {
            const validContexts = contexts.filter((context) => {
                const age = now - context.timestamp.getTime();
                const isValid = age < this.maxContextAge;

                if (!isValid) {
                    this.seenHashes.delete(context.semanticHash);
                    this.contentEmbeddings.delete(context.id);
                    totalRemoved++;
                }

                return isValid;
            });

            if (validContexts.length === 0) {
                this.contexts.delete(chatId);
            } else if (validContexts.length !== contexts.length) {
                this.contexts.set(chatId, validContexts);
            }
        }

        if (totalRemoved > 0) {
            console.log(
                `🧹 [SEMANTIC] Cleaned up ${totalRemoved} expired contexts`
            );
        }
    }
}
