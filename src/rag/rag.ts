import { Document } from "@langchain/core/documents";
import { QdrantVectorStore } from "@langchain/qdrant";
import { QdrantClient } from "@qdrant/js-client-rest";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import BM25 from "okapibm25";
import axios from "axios";
import {
    RagConfig,
    ChatContext,
    RelevantContext,
    ColBERTRerankResponse,
    HybridSearchResult,
} from "./types";
import { LMStudioEmbeddings } from "./embeddings";

export class RAGModule {
    private config: RagConfig;
    private vectorStore!: QdrantVectorStore;
    private initialized: boolean = false;
    private readonly qdrantClient: QdrantClient;
    private readonly chatContexts: Map<string, ChatContext> = new Map();
    private readonly textSplitter: RecursiveCharacterTextSplitter;

    constructor(config: RagConfig) {
        this.config = config;
        this.qdrantClient = new QdrantClient({
            url: config.qdrant.url,
            apiKey: config.qdrant.apiKey,
        });

        this.textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: config.chunking?.chunkSize ?? 1000,
            chunkOverlap: config.chunking?.chunkOverlap ?? 200,
            separators: ["\n\n", "\n", " ", ""],
        });
    }

    private async initializeVectorStore(): Promise<void> {
        if (this.initialized) return;

        this.vectorStore = await QdrantVectorStore.fromExistingCollection(
            this.config.embeddings,
            {
                client: this.qdrantClient,
                collectionName: this.config.qdrant.collectionName,
            }
        );

        this.initialized = true;
    }

    async clearContext(chatId: string): Promise<void> {
        this.chatContexts.delete(chatId);
    }

    async addContext(
        chatId: string,
        context: Document | Document[]
    ): Promise<void> {
        await this.initializeVectorStore();

        const inputs = Array.isArray(context) ? context : [context];

        const documents: Document[] = [];
        for (const input of inputs) {
            const chunks = await this.textSplitter.splitDocuments([input]);
            const enrichedChunks = chunks.map(
                (chunk: Document, index: number) =>
                    new Document({
                        pageContent: chunk.pageContent,
                        metadata: {
                            ...input.metadata,
                            chunkIndex: index,
                            totalChunks: chunks.length,
                            originalLength: input.pageContent.length,
                        },
                    })
            );
            documents.push(...enrichedChunks);
        }

        let chatContext = this.chatContexts.get(chatId);
        if (!chatContext) {
            chatContext = {
                chatId,
                documents: [],
                lastUpdated: new Date(),
            };
            this.chatContexts.set(chatId, chatContext);
        }

        chatContext.documents.push(...documents);
        chatContext.lastUpdated = new Date();

        await this.vectorStore.addDocuments(documents, {
            customPayload: documents.map(() => ({
                chatId: chatId,
            })),
        });
    }

    async getRelevantContext(
        chatId: string,
        query: string,
        topK: number = 5
    ): Promise<RelevantContext[]> {
        console.log(
            `Retrieving relevant context for chatId: ${chatId}, query: "${query}", topK: ${topK}`
        );
        await this.initializeVectorStore();

        const chatContext = this.chatContexts.get(chatId);
        if (!chatContext?.documents?.length) {
            return [];
        }

        const hybridResults = await this.performHybridSearch(
            chatContext,
            query,
            topK
        );

        const finalResults = await this.rerankWithColBERT(
            query,
            hybridResults,
            topK
        );

        return finalResults;
    }

    private async performHybridSearch(
        chatContext: ChatContext,
        query: string,
        topK: number
    ): Promise<HybridSearchResult[]> {
        console.log(
            `Performing hybrid search for query: "${query}" with topK: ${topK}`
        );
        const vectorResults = await this.vectorSearch(
            chatContext.chatId,
            query,
            topK * 2
        );
        console.log(`Vector search returned ${vectorResults.length} results`);
        const bm25Results = this.bm25Search(chatContext, query, topK * 2);
        console.log(`BM25 search returned ${bm25Results.length} results`);

        const combinedResults = new Map<string, HybridSearchResult>();

        for (const vectorResult of vectorResults) {
            const docId = this.getDocumentId(vectorResult.document);
            combinedResults.set(docId, {
                document: vectorResult.document,
                vectorScore: vectorResult.score,
                bm25Score: 0,
                combinedScore: 0,
            });
        }

        for (const bm25Result of bm25Results) {
            const docId = this.getDocumentId(bm25Result.document);
            const existing = combinedResults.get(docId);
            if (existing) {
                existing.bm25Score = bm25Result.score;
            } else {
                combinedResults.set(docId, {
                    document: bm25Result.document,
                    vectorScore: 0,
                    bm25Score: bm25Result.score,
                    combinedScore: 0,
                });
            }
        }

        const normalizedResults = Array.from(combinedResults.values()).map(
            (result) => {
                const vectorWeight = this.config.hybrid.vectorWeight;
                const bm25Weight = this.config.hybrid.bm25Weight;
                result.combinedScore =
                    result.vectorScore * vectorWeight +
                    result.bm25Score * bm25Weight;
                return result;
            }
        );

        return normalizedResults
            .sort((a, b) => b.combinedScore - a.combinedScore)
            .slice(0, this.config.hybrid.rerankTopK ?? topK * 2);
    }

    private async vectorSearch(
        chatId: string,
        query: string,
        topK: number
    ): Promise<{ document: Document; score: number }[]> {
        const results = await this.vectorStore.similaritySearchWithScore(
            query,
            topK,
            {
                must: [
                    {
                        key: "chatId",
                        match: {
                            value: chatId,
                        },
                    },
                ],
            }
        );

        return results.map(([document, score]) => ({
            document,
            score,
        }));
    }

    private bm25Search(
        chatContext: ChatContext,
        query: string,
        topK: number
    ): { document: Document; score: number }[] {
        if (!chatContext?.documents?.length) {
            return [];
        }

        const documentTexts = chatContext.documents.map(
            (doc) => doc.pageContent
        );
        const queryTerms = query.split(" ");

        const scores = BM25(
            documentTexts,
            // clean up query terms to avoid issues with special characters in bm25 library, like:
            // @example SyntaxError: Invalid regular expression: /(assuming/g: Unterminated group
            queryTerms.map((qt) => qt.replace(/[)(*.-{}]/g, "")),
            {
                k1: this.config.bm25.k1 ?? 1.5,
                b: this.config.bm25.b ?? 0.75,
            }
        ) as number[];

        return scores
            .map((score: number, index: number) => ({
                document: chatContext.documents[index],
                score,
            }))
            .sort(
                (a: { score: number }, b: { score: number }) =>
                    b.score - a.score
            )
            .slice(0, topK);
    }

    private async rerankWithColBERT(
        query: string,
        hybridResults: HybridSearchResult[],
        topK: number
    ): Promise<RelevantContext[]> {
        console.log(
            `Reranking with ColBERT for query: "${query}", topK: ${topK}`
        );
        if (hybridResults.length === 0) {
            return [];
        }

        try {
            const documents = hybridResults.map((r) => r.document.pageContent);

            const response = await axios.post<ColBERTRerankResponse>(
                this.config.colbert.apiUrl,
                {
                    model: this.config.colbert.modelName,
                    input: {
                        query,
                        documents,
                    },
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            );

            const rerankScores = response.data.scores;

            const rerankedResults = hybridResults
                .map((result, index) => ({
                    ...result,
                    rerankScore: rerankScores?.[index] ?? 0,
                }))
                .sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0))
                .slice(0, topK);

            return rerankedResults.map((result, index) => ({
                document: result.document,
                score: result.rerankScore || result.combinedScore,
                retriever: "hybrid" as const,
                metadata: {
                    rank: index + 1,
                    vectorScore: result.vectorScore,
                    bm25Score: result.bm25Score,
                    combinedScore: result.combinedScore,
                    rerankScore: result.rerankScore,
                },
            }));
        } catch (error) {
            console.warn(
                "ColBERT reranking failed, falling back to hybrid scores:",
                error
            );

            return hybridResults
                .sort((a, b) => b.combinedScore - a.combinedScore)
                .slice(0, topK)
                .map((result, index) => ({
                    document: result.document,
                    score: result.combinedScore,
                    retriever: "hybrid" as const,
                    metadata: {
                        rank: index + 1,
                        vectorScore: result.vectorScore,
                        bm25Score: result.bm25Score,
                        combinedScore: result.combinedScore,
                    },
                }));
        }
    }

    private getDocumentId(document: Document): string {
        return document.metadata?.id ?? document.pageContent.slice(0, 50);
    }

    getStatistics(): {
        initialized: boolean;
        chatContextCount: number;
        totalDocuments: number;
        configuration: RagConfig;
    } {
        const totalDocuments = Array.from(this.chatContexts.values()).reduce(
            (sum, context) => sum + context.documents.length,
            0
        );

        return {
            initialized: this.initialized,
            chatContextCount: this.chatContexts.size,
            totalDocuments,
            configuration: this.config,
        };
    }

    async getHealthStatus(): Promise<{
        status: "healthy" | "degraded" | "unhealthy";
        details: {
            initialized: boolean;
            chatContextCount: number;
            totalDocuments: number;
            lastError?: string;
        };
    }> {
        try {
            const stats = this.getStatistics();
            const status = stats.initialized ? "healthy" : "degraded";

            return {
                status,
                details: {
                    initialized: stats.initialized,
                    chatContextCount: stats.chatContextCount,
                    totalDocuments: stats.totalDocuments,
                },
            };
        } catch (error) {
            return {
                status: "unhealthy",
                details: {
                    initialized: false,
                    chatContextCount: 0,
                    totalDocuments: 0,
                    lastError:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                },
            };
        }
    }

    async initialize(documents: Document[]): Promise<void> {
        if (documents.length === 0) return;

        const defaultChatId = "default";
        await this.addContext(defaultChatId, documents);
    }

    async retrieve(
        query: string,
        options: { topK?: number } = {}
    ): Promise<Document[]> {
        const defaultChatId = "default";
        const topK = options.topK ?? 10;

        const results = await this.getRelevantContext(
            defaultChatId,
            query,
            topK
        );
        return results.map((r) => r.document);
    }

    async addDocuments(documents: Document[]): Promise<void> {
        const defaultChatId = "default";
        await this.addContext(defaultChatId, documents);
    }

    async reset(): Promise<void> {
        this.chatContexts.clear();
        this.initialized = false;
    }

    isInitialized(): boolean {
        return this.initialized;
    }

    getDocumentCount(): number {
        return Array.from(this.chatContexts.values()).reduce(
            (sum, context) => sum + context.documents.length,
            0
        );
    }

    getDocuments(): Document[] {
        const defaultChatId = "default";
        const context = this.chatContexts.get(defaultChatId);
        return context ? context.documents : [];
    }

    updateConfig(newConfig: Partial<RagConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }

    async clear(): Promise<void> {
        await this.reset();
    }

    getAllDocumentsForChat(chatId: string): Document[] {
        const context = this.chatContexts.get(chatId);
        return context ? context.documents : [];
    }
}

export function createRAGModule(config: Partial<RagConfig>): RAGModule {
    const defaultConfig: RagConfig = {
        lmStudioApiUrl: config.lmStudioApiUrl ?? "http://localhost:1234/v1",
        qdrant: {
            ...config.qdrant,
            url: config.qdrant?.url ?? "http://localhost:6333",
            collectionName: config.qdrant?.collectionName ?? "rag3_collection",
            vectorSize: config.qdrant?.vectorSize ?? 1536,
            distance: config.qdrant?.distance ?? "Cosine",
        },
        colbert: {
            ...config.colbert,
            modelName:
                config.colbert?.modelName ?? "text-embedding-colbertv2.0",
            apiUrl: config.colbert?.apiUrl ?? "http://localhost:1234/v1/rerank",
            topK: config.colbert?.topK ?? 10,
        },
        bm25: {
            ...config.bm25,
            k1: config.bm25?.k1 ?? 1.5,
            b: config.bm25?.b ?? 0.75,
        },
        hybrid: {
            ...config.hybrid,
            vectorWeight: config.hybrid?.vectorWeight ?? 0.6,
            bm25Weight: config.hybrid?.bm25Weight ?? 0.4,
            rerankTopK: config.hybrid?.rerankTopK ?? 20,
            finalTopK: config.hybrid?.finalTopK ?? 10,
        },
        chunking: {
            chunkSize: config.chunking?.chunkSize ?? 1000,
            chunkOverlap: config.chunking?.chunkOverlap ?? 200,
        },
        embeddings: new LMStudioEmbeddings({
            apiUrl: config.lmStudioApiUrl ?? "http://localhost:1234/v1",
            modelName: "text-embedding-nomic-embed-text-v1.5",
        }),
    };

    return new RAGModule(defaultConfig);
}
