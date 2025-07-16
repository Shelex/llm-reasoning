import { Embeddings } from "@langchain/core/embeddings";
import axios from "axios";

export interface LMStudioEmbeddingsConfig {
    apiUrl?: string;
    modelName?: string;
    timeout?: number;
    batchSize?: number;
}

export class LMStudioEmbeddings extends Embeddings {
    private readonly apiUrl: string;
    private readonly modelName: string;
    private readonly timeout: number;
    private readonly batchSize: number;

    constructor(config: LMStudioEmbeddingsConfig = {}) {
        super({});
        this.apiUrl = config.apiUrl ?? "http://localhost:1234/v1";
        this.modelName =
            config.modelName ?? "text-embedding-nomic-embed-text-v1.5";
        this.timeout = config.timeout ?? 30 * 1000; // 30 s
        this.batchSize = config.batchSize ?? 100;
    }

    async embedDocuments(texts: string[]): Promise<number[][]> {
        const embeddings: number[][] = [];

        for (let i = 0; i < texts.length; i += this.batchSize) {
            const batch = texts.slice(i, i + this.batchSize);
            const batchEmbeddings = await this.embedBatch(batch);
            embeddings.push(...batchEmbeddings);
        }

        return embeddings;
    }

    async embedQuery(text: string): Promise<number[]> {
        const embeddings = await this.embedBatch([text]);
        return embeddings[0];
    }

    private async embedBatch(texts: string[]): Promise<number[][]> {
        try {
            const response = await axios.post(
                `${this.apiUrl}/embeddings`,
                {
                    model: this.modelName,
                    input: texts,
                },
                {
                    timeout: this.timeout,
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            );

            if (!response?.data?.data) {
                throw new Error(
                    "Invalid response format from LM Studio embeddings API"
                );
            }

            return response.data.data.map(
                (item: { embedding: number[] }) => item.embedding
            );
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(
                    `LM Studio embeddings API error: ${
                        error.response?.status
                    } - ${error.response?.statusText ?? error.message}`
                );
            }
            throw new Error(
                `Failed to get embeddings from LM Studio: ${error}`
            );
        }
    }

    async getEmbeddingDimension(): Promise<number> {
        try {
            const testEmbedding = await this.embedQuery("test");
            return testEmbedding.length;
        } catch (error) {
            console.warn(`Could not determine embedding dimension: ${error}`);
        }

        const defaultDimension = 768; // default dimension for nomic embeddings
        return defaultDimension;
    }
}
