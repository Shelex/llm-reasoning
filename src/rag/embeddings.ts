import { OpenAIEmbeddings } from "@langchain/openai";

export interface EmbeddingsConfig {
    apiUrl?: string;
    modelName?: string;
    timeout?: number;
    batchSize?: number;
    apiKey?: string;
}

export function createEmbeddings(config: EmbeddingsConfig = {}) {
    return new OpenAIEmbeddings({
        model: config.modelName ?? "text-embedding-nomic-embed-text-v1.5",
        openAIApiKey: config.apiKey ?? "not-needed-for-local",
        configuration: {
            baseURL: config.apiUrl ?? "http://localhost:1234/v1",
            timeout: config.timeout ?? 60 * 1000,
        },
        batchSize: config.batchSize ?? 100,
    });
}
