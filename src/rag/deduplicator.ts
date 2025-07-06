import { EmbeddingsClient } from "./embeddings";
import { SemanticContext } from "./semantic";
import { LMStudioClient } from "../services/lm-studio-client";

export interface DeduplicationResult {
    isDuplicate: boolean;
    similarity: number;
    duplicateType: "exact" | "semantic" | "paraphrase" | "none";
    existingContextId?: string;
    confidence: number;
}

export interface DeduplicationConfig {
    exactMatchThreshold: number;
    semanticSimilarityThreshold: number;
    paraphraseThreshold: number;
    enableLLMValidation: boolean;
    maxLLMValidationLength: number;
}

export class Deduplicator {
    private readonly embeddingsClient: EmbeddingsClient;
    private readonly llmClient: LMStudioClient;
    private readonly config: DeduplicationConfig;

    private readonly exactMatchCache = new Map<string, string>(); // hash -> contextId
    private readonly semanticHashCache = new Map<string, string>(); // semantic hash -> contextId
    private readonly llmValidationCache = new Map<string, boolean>(); // content pair hash -> isDuplicate

    private readonly maxCacheSize = 2000;

    constructor(
        embeddingsClient: EmbeddingsClient,
        llmClient: LMStudioClient,
        config?: Partial<DeduplicationConfig>
    ) {
        this.embeddingsClient = embeddingsClient;
        this.llmClient = llmClient;
        this.config = {
            exactMatchThreshold: 0.95,
            semanticSimilarityThreshold: 0.85,
            paraphraseThreshold: 0.75,
            enableLLMValidation: true,
            maxLLMValidationLength: 500,
            ...config,
        };
    }

    async checkDuplication(
        newContent: string,
        existingContexts: SemanticContext[],
        chatId: string
    ): Promise<DeduplicationResult> {
        console.log(
            `🔍 [DEDUPLICATOR] Checking duplication for content: ${newContent.substring(
                0,
                50
            )}...`
        );

        if (!existingContexts.length) {
            return {
                isDuplicate: false,
                similarity: 0,
                duplicateType: "none",
                confidence: 1.0,
            };
        }

        const exactMatch = await this.checkExactMatch(
            newContent,
            existingContexts
        );
        if (exactMatch.isDuplicate) {
            console.log(
                `✅ [DEDUPLICATOR] Exact match found: ${exactMatch.similarity}`
            );
            return exactMatch;
        }

        const semanticMatch = await this.checkSemanticHash(
            newContent,
            existingContexts
        );
        if (semanticMatch.isDuplicate) {
            console.log(
                `✅ [DEDUPLICATOR] Semantic hash match found: ${semanticMatch.similarity}`
            );
            return semanticMatch;
        }

        const embeddingMatch = await this.checkEmbeddingSimilarity(
            newContent,
            existingContexts
        );

        if (!embeddingMatch.isDuplicate) {
            console.log(`❌ [DEDUPLICATOR] No duplicates found`);
            return {
                isDuplicate: false,
                similarity: 0,
                duplicateType: "none",
                confidence: 1.0,
            };
        }

        console.log(
            `✅ [DEDUPLICATOR] Embedding similarity match found: ${embeddingMatch.similarity}`
        );

        if (
            this.config.enableLLMValidation &&
            embeddingMatch.similarity <
                this.config.semanticSimilarityThreshold + 0.1 &&
            newContent.length <= this.config.maxLLMValidationLength
        ) {
            const llmValidation = await this.validateWithLLM(
                newContent,
                existingContexts.find(
                    (ctx) => ctx.id === embeddingMatch.existingContextId
                )!.content,
                chatId
            );

            if (!llmValidation) {
                console.log(
                    `🔄 [DEDUPLICATOR] LLM validation rejected embedding match`
                );
                return {
                    isDuplicate: false,
                    similarity: embeddingMatch.similarity,
                    duplicateType: "none",
                    confidence: 0.8,
                };
            }

            return embeddingMatch;
        }

        return {
            isDuplicate: false,
            similarity: 0,
            duplicateType: "none",
            confidence: 1.0,
        };
    }

    private async checkExactMatch(
        newContent: string,
        existingContexts: SemanticContext[]
    ): Promise<DeduplicationResult> {
        const normalizedNew = this.normalizeForComparison(newContent);
        const newHash = this.generateContentHash(normalizedNew);

        if (this.exactMatchCache.has(newHash)) {
            const existingContextId = this.exactMatchCache.get(newHash)!;
            return {
                isDuplicate: true,
                similarity: 1.0,
                duplicateType: "exact",
                existingContextId,
                confidence: 1.0,
            };
        }

        for (const context of existingContexts) {
            const normalizedExisting = this.normalizeForComparison(
                context.content
            );
            const existingHash = this.generateContentHash(normalizedExisting);

            if (newHash === existingHash) {
                this.manageCacheSize(this.exactMatchCache);
                this.exactMatchCache.set(newHash, context.id);

                return {
                    isDuplicate: true,
                    similarity: 1.0,
                    duplicateType: "exact",
                    existingContextId: context.id,
                    confidence: 1.0,
                };
            }

            const charSimilarity = this.calculateCharacterSimilarity(
                normalizedNew,
                normalizedExisting
            );
            if (charSimilarity >= this.config.exactMatchThreshold) {
                return {
                    isDuplicate: true,
                    similarity: charSimilarity,
                    duplicateType: "exact",
                    existingContextId: context.id,
                    confidence: 0.95,
                };
            }
        }

        return {
            isDuplicate: false,
            similarity: 0,
            duplicateType: "none",
            confidence: 1.0,
        };
    }

    private async checkSemanticHash(
        newContent: string,
        existingContexts: SemanticContext[]
    ): Promise<DeduplicationResult> {
        const semanticHash = await this.generateSemanticHash(newContent);

        if (this.semanticHashCache.has(semanticHash)) {
            const existingContextId = this.semanticHashCache.get(semanticHash)!;
            return {
                isDuplicate: true,
                similarity: 0.9,
                duplicateType: "semantic",
                existingContextId,
                confidence: 0.9,
            };
        }

        for (const context of existingContexts) {
            if (context.semanticHash === semanticHash) {
                this.manageCacheSize(this.semanticHashCache);
                this.semanticHashCache.set(semanticHash, context.id);

                return {
                    isDuplicate: true,
                    similarity: 0.9,
                    duplicateType: "semantic",
                    existingContextId: context.id,
                    confidence: 0.9,
                };
            }
        }

        return {
            isDuplicate: false,
            similarity: 0,
            duplicateType: "none",
            confidence: 1.0,
        };
    }

    private async checkEmbeddingSimilarity(
        newContent: string,
        existingContexts: SemanticContext[]
    ): Promise<DeduplicationResult> {
        const newEmbedding = await this.embeddingsClient.generateEmbedding(
            newContent
        );

        let highestSimilarity = 0;
        let mostSimilarContext: SemanticContext | null = null;

        for (const context of existingContexts) {
            const similarity = this.embeddingsClient.calculateCosineSimilarity(
                newEmbedding,
                context.embedding
            );

            if (similarity > highestSimilarity) {
                highestSimilarity = similarity;
                mostSimilarContext = context;
            }
        }

        if (highestSimilarity >= this.config.semanticSimilarityThreshold) {
            return {
                isDuplicate: true,
                similarity: highestSimilarity,
                duplicateType: "semantic",
                existingContextId: mostSimilarContext!.id,
                confidence: 0.85,
            };
        }

        if (highestSimilarity >= this.config.paraphraseThreshold) {
            return {
                isDuplicate: true,
                similarity: highestSimilarity,
                duplicateType: "paraphrase",
                existingContextId: mostSimilarContext!.id,
                confidence: 0.75,
            };
        }

        return {
            isDuplicate: false,
            similarity: highestSimilarity,
            duplicateType: "none",
            confidence: 1.0,
        };
    }

    private async validateWithLLM(
        newContent: string,
        existingContent: string,
        chatId: string
    ): Promise<boolean> {
        const cacheKey = this.generateContentHash(
            newContent + "|" + existingContent
        );

        if (this.llmValidationCache.has(cacheKey)) {
            return this.llmValidationCache.get(cacheKey)!;
        }

        const prompt = `Compare these two pieces of text and determine if they contain essentially the same information, even if worded differently.

Text 1: "${newContent}"
Text 2: "${existingContent}"

Consider them duplicates if they:
- Convey the same core facts or information
- Have the same meaning despite different wording
- Are paraphrases of each other
- One is a subset of the other with no additional meaningful information

Respond with only "DUPLICATE" or "UNIQUE":`;

        try {
            const response = await this.llmClient.queryLLM(
                prompt,
                0.1,
                chatId,
                "duplication_validation"
            );

            const result =
                response.content.trim().toUpperCase() === "DUPLICATE";

            this.manageCacheSize(this.llmValidationCache);
            this.llmValidationCache.set(cacheKey, result);

            return result;
        } catch (error) {
            console.error("LLM validation failed:", error);
            return false;
        }
    }

    private normalizeForComparison(text: string): string {
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    private generateContentHash(content: string): string {
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // convert to 32bit integer
        }
        return hash.toString(36);
    }

    private async generateSemanticHash(content: string): Promise<string> {
        const normalized = this.normalizeForComparison(content);
        const words = normalized.split(" ").filter((word) => word.length > 3);

        const sortedWords = words.sort();
        const keyWords = sortedWords.slice(0, 10);

        return this.generateContentHash(keyWords.join(" "));
    }

    private calculateCharacterSimilarity(str1: string, str2: string): number {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;

        if (!longer.length) {
            return 1.0;
        }

        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    private levenshteinDistance(str1: string, str2: string): number {
        const matrix = Array(str2.length + 1)
            .fill(null)
            .map(() => Array(str1.length + 1).fill(null));

        for (let i = 0; i <= str1.length; i++) {
            matrix[0][i] = i;
        }

        for (let j = 0; j <= str2.length; j++) {
            matrix[j][0] = j;
        }

        for (let j = 1; j <= str2.length; j++) {
            for (let i = 1; i <= str1.length; i++) {
                const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1, // deletion
                    matrix[j - 1][i] + 1, // insertion
                    matrix[j - 1][i - 1] + indicator // substitution
                );
            }
        }

        return matrix[str2.length][str1.length];
    }

    private manageCacheSize<K, V>(cache: Map<K, V>): void {
        if (cache.size >= this.maxCacheSize) {
            const keysToRemove = Array.from(cache.keys()).slice(
                0,
                this.maxCacheSize * 0.2
            );
            keysToRemove.forEach((key) => cache.delete(key));
        }
    }

    async findSimilarContexts(
        content: string,
        contexts: SemanticContext[],
        threshold: number = 0.7
    ): Promise<Array<{ context: SemanticContext; similarity: number }>> {
        const contentEmbedding = await this.embeddingsClient.generateEmbedding(
            content
        );

        return contexts
            .map((context) => ({
                context,
                similarity: this.embeddingsClient.calculateCosineSimilarity(
                    contentEmbedding,
                    context.embedding
                ),
            }))
            .filter((result) => result.similarity >= threshold)
            .sort((a, b) => b.similarity - a.similarity);
    }

    async mergeInformation(
        newContent: string,
        existingContent: string,
        chatId: string
    ): Promise<string> {
        const prompt = `Merge these two pieces of information into a single, comprehensive text that includes all unique information from both sources.

Existing information: "${existingContent}"
New information: "${newContent}"

Requirements:
- Include all unique facts and details from both sources
- Remove redundant information
- Maintain factual accuracy
- Keep the result concise but complete
- Use clear, natural language

Merged information:`;

        try {
            const response = await this.llmClient.queryLLM(
                prompt,
                0.2,
                chatId,
                "merge_information"
            );

            return response.content.trim();
        } catch (error) {
            console.error("Information merging failed:", error);
            // just concatenate
            return `${existingContent} ${newContent}`.trim();
        }
    }

    clearCaches(): void {
        this.exactMatchCache.clear();
        this.semanticHashCache.clear();
        this.llmValidationCache.clear();
        console.log("🧹 [DEDUPLICATOR] All caches cleared");
    }

    getCacheStats(): {
        exactMatches: number;
        semanticHashes: number;
        llmValidations: number;
        totalCacheSize: number;
    } {
        return {
            exactMatches: this.exactMatchCache.size,
            semanticHashes: this.semanticHashCache.size,
            llmValidations: this.llmValidationCache.size,
            totalCacheSize:
                this.exactMatchCache.size +
                this.semanticHashCache.size +
                this.llmValidationCache.size,
        };
    }

    updateConfig(newConfig: Partial<DeduplicationConfig>): void {
        Object.assign(this.config, newConfig);
        console.log("🔧 [DEDUPLICATOR] Configuration updated");
    }

    getConfig(): DeduplicationConfig {
        return { ...this.config };
    }
}
