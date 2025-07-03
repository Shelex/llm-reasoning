import { pipeline, FeatureExtractionPipeline } from "@xenova/transformers";

export class LocalEmbeddings {
    private model: FeatureExtractionPipeline | null = null;
    private readonly modelName = "Xenova/all-MiniLM-L6-v2";

    async initialize(): Promise<void> {
        this.model ??= await pipeline("feature-extraction", this.modelName);
    }

    async embedDocuments(texts: string[]): Promise<number[][]> {
        await this.initialize();

        const embeddings: number[][] = [];
        for (const text of texts) {
            const result = await this.model!(text, {
                pooling: "mean",
                normalize: true,
            });
            embeddings.push(Array.from(result.data));
        }

        return embeddings;
    }

    async embedQuery(text: string): Promise<number[]> {
        await this.initialize();

        const result = await this.model!(text, {
            pooling: "mean",
            normalize: true,
        });
        return Array.from(result.data);
    }
}
