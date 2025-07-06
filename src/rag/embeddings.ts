import { OpenAIEmbeddings } from "@langchain/openai";
import { LMStudioClient } from "../services/lm-studio-client";

export class EmbeddingsClient {
    private readonly embeddings: OpenAIEmbeddings;
    private readonly llmClient: LMStudioClient;
    private readonly embeddingCache = new Map<string, number[]>();
    private readonly maxCacheSize = 1000;

    constructor(llmClient: LMStudioClient) {
        this.llmClient = llmClient;

        console.log(
            `[EMBEDDINGS] Initializing embeddings client for ${llmClient.baseUrl}`
        );

        this.embeddings = new OpenAIEmbeddings({
            apiKey: "not-needed",
            configuration: {
                baseURL: `${llmClient.baseUrl}/v1`,
            },
            model: "text-embedding-nomic-embed-text-v1.5",
            maxConcurrency: 1,
            timeout: 60 * 1000,
        });

        console.log(
            `[EMBEDDINGS] Client initialized. Make sure LM Studio has an embedding model loaded.`
        );
    }

    async generateEmbedding(text: string): Promise<number[]> {
        const normalizedText = this.normalizeText(text);

        if (!normalizedText?.trim()?.length) {
            throw new Error("empty text provided for embedding generation");
        }

        const cacheKey = this.generateCacheKey(normalizedText);

        if (this.embeddingCache.has(cacheKey)) {
            return this.embeddingCache.get(cacheKey)!;
        }

        try {
            console.log(
                `[EMBEDDINGS] Generating embedding for text: ${normalizedText.substring(
                    0,
                    50
                )}...`
            );

            const embedding = await this.embeddings.embedQuery(normalizedText);

            if (!embedding || !Array.isArray(embedding) || !embedding.length) {
                console.error(
                    "invalid embedding response from server:",
                    embedding
                );
                throw new Error("invalid embedding response");
            }

            if (this.embeddingCache.size >= this.maxCacheSize) {
                const firstKey = this.embeddingCache.keys().next().value;
                if (firstKey !== undefined) {
                    this.embeddingCache.delete(firstKey);
                }
            }

            this.embeddingCache.set(cacheKey, embedding);
            console.log(
                `[EMBEDDINGS] Generated embeddings`
            );
            return embedding;
        } catch (error) {
            console.error(
                `[EMBEDDINGS] Failed to generate embedding for text "${normalizedText.substring(
                    0,
                    100
                )}":`,
                error
            );
            const errorMessage =
                error instanceof Error ? error.message : String(error);
            throw new Error(`Embedding generation failed: ${errorMessage}`);
        }
    }

    async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
        const normalizedTexts = texts.map((text) => this.normalizeText(text));
        const results: number[][] = [];
        const uncachedTexts: string[] = [];
        const uncachedIndices: number[] = [];

        for (let i = 0; i < normalizedTexts.length; i++) {
            const text = normalizedTexts[i];
            const cacheKey = this.generateCacheKey(text);

            if (this.embeddingCache.has(cacheKey)) {
                results[i] = this.embeddingCache.get(cacheKey)!;
            } else {
                uncachedTexts.push(text);
                uncachedIndices.push(i);
            }
        }

        if (!uncachedTexts.length) {
            return results;
        }

        try {
            const newEmbeddings = await this.embeddings.embedDocuments(
                uncachedTexts
            );

            for (let i = 0; i < uncachedTexts.length; i++) {
                const text = uncachedTexts[i];
                const embedding = newEmbeddings[i];
                const originalIndex = uncachedIndices[i];
                const cacheKey = this.generateCacheKey(text);

                if (this.embeddingCache.size >= this.maxCacheSize) {
                    const firstKey = this.embeddingCache.keys().next().value;
                    if (firstKey !== undefined) {
                        this.embeddingCache.delete(firstKey);
                    }
                }

                this.embeddingCache.set(cacheKey, embedding);
                results[originalIndex] = embedding;
            }
        } catch (error) {
            console.error("Failed to generate batch embeddings:", error);
            const errorMessage =
                error instanceof Error ? error.message : String(error);
            throw new Error(
                `Batch embedding generation failed: ${errorMessage}`
            );
        }
        return results;
    }

    calculateCosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error("Vectors must have the same length");
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        normA = Math.sqrt(normA);
        normB = Math.sqrt(normB);

        if (normA === 0 || normB === 0) {
            return 0;
        }

        return dotProduct / (normA * normB);
    }

    async findMostSimilar(
        queryEmbedding: number[],
        candidateEmbeddings: Array<{ embedding: number[]; metadata: any }>,
        threshold: number = 0.7,
        topK: number = 5
    ): Promise<Array<{ similarity: number; metadata: any }>> {
        const similarities = candidateEmbeddings.map((candidate) => ({
            similarity: this.calculateCosineSimilarity(
                queryEmbedding,
                candidate.embedding
            ),
            metadata: candidate.metadata,
        }));

        return similarities
            .filter((result) => result.similarity >= threshold)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK);
    }

    private normalizeText(text: string): string {
        if (!text || typeof text !== "string") {
            return "";
        }

        const normalized = text
            .toLowerCase()
            .replace(/\s+/g, " ")
            .replace(/[^\w\s]/g, " ")
            .trim()
            .substring(0, 8000);

        if (normalized.length < 2) {
            console.warn(
                `[EMBEDDINGS] Text too short after normalization: "${text}" -> "${normalized}"`
            );
        }

        return normalized;
    }

    private generateCacheKey(text: string): string {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // convert to 32bit integer
        }
        return hash.toString();
    }

    clearCache(): void {
        this.embeddingCache.clear();
    }

    async healthCheck(): Promise<boolean> {
        try {
            console.log(`[EMBEDDINGS] Checking health of embeddings server...`);

            const testEmbedding = await this.embeddings.embedQuery("test");

            if (
                !testEmbedding ||
                !Array.isArray(testEmbedding) ||
                !testEmbedding.length
            ) {
                throw new Error("invalid test embedding response");
            }

            console.log(
                `[EMBEDDINGS] Health check passed - server responding correctly`
            );
            return true;
        } catch (error) {
            console.error(
                `
                [EMBEDDINGS] Health check failed:
                [EMBEDDINGS] Setup instructions:
                [EMBEDDINGS] 1. Start LM Studio application
                [EMBEDDINGS] 2. Go to 'Local Server' tab
                [EMBEDDINGS] 3. Load an embedding model (e.g., text-embedding-nomic-embed-text-v1.5)
                [EMBEDDINGS] 4. Start the server on ${this.llmClient.baseUrl}
                [EMBEDDINGS] 5. Ensure the embedding model is loaded and responding
                `,
                error
            );
            return false;
        }
    }

    getCacheStats(): { size: number; maxSize: number; hitRate?: number } {
        return {
            size: this.embeddingCache.size,
            maxSize: this.maxCacheSize,
        };
    }
}
