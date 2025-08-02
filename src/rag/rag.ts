import { Document } from "@langchain/core/documents";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import BM25 from "okapibm25";
import { reciprocalRankFusion } from "rerank";
import {
    RagConfig,
    ChatContext,
    RelevantContext,
    HybridSearchResult,
} from "./types";
import { createEmbeddings } from "./embeddings";

export class RAGModule {
    private config: RagConfig;
    private vectorStores: Map<string, FaissStore> = new Map();
    private initialized: boolean = false;
    private readonly chatContexts: Map<string, ChatContext> = new Map();
    private readonly textSplitter: RecursiveCharacterTextSplitter;

    constructor(config: RagConfig) {
        this.config = config;

        this.textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: config.chunking?.chunkSize ?? 1000,
            chunkOverlap: config.chunking?.chunkOverlap ?? 200,
            separators: ["\n\n", "\n", " ", ""],
        });
    }

    private async getOrCreateVectorStore(chatId: string): Promise<FaissStore> {
        let vectorStore = this.vectorStores.get(chatId);
        
        if (!vectorStore) {
            vectorStore = new FaissStore(this.config.embeddings, {});
            this.vectorStores.set(chatId, vectorStore);
        }
        
        return vectorStore;
    }

    async clearContext(chatId: string): Promise<void> {
        this.chatContexts.delete(chatId);
        this.vectorStores.delete(chatId);
    }

    async addContext(
        chatId: string,
        context: Document | Document[]
    ): Promise<void> {
        const vectorStore = await this.getOrCreateVectorStore(chatId);
        
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
                            chatId: chatId,
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

        await vectorStore.addDocuments(documents);
    }

    async getRelevantContext(
        chatId: string,
        query: string,
        topK: number = 5
    ): Promise<RelevantContext[]> {
        console.log(
            `Retrieving relevant context for chatId: ${chatId}, query: "${query}", topK: ${topK}`
        );

        const chatContext = this.chatContexts.get(chatId);
        if (!chatContext?.documents?.length) {
            return [];
        }

        const hybridResults = await this.performHybridSearch(
            chatContext,
            query,
            topK
        );

        const finalResults = await this.rerankWithRRF(
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
        const vectorStore = this.vectorStores.get(chatId);
        if (!vectorStore) {
            return [];
        }

        const results = await vectorStore.similaritySearchWithScore(query, topK);

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

    private async rerankWithRRF(
        query: string,
        hybridResults: HybridSearchResult[],
        topK: number
    ): Promise<RelevantContext[]> {
        console.log(`Reranking with RRF for query: "${query}", topK: ${topK}`);
        if (!hybridResults.length) {
            return [];
        }

        const documents = hybridResults.map((result) => ({
            id: this.getDocumentId(result.document),
            document: result.document,
            originalResult: result,
        }));

        const rankedIds = reciprocalRankFusion([documents], "id");

        const resultsMap = new Map<string, HybridSearchResult>();
        hybridResults.forEach((result) => {
            const docId = this.getDocumentId(result.document);
            resultsMap.set(docId, result);
        });

        const rerankedResults = Array.from(rankedIds.entries())
            .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
            .slice(0, topK)
            .map(([docId, rrfScore], index) => {
                const originalResult = resultsMap.get(docId)!;
                return {
                    document: originalResult.document,
                    score: rrfScore,
                    retriever: "hybrid" as const,
                    metadata: {
                        rank: index + 1,
                        vectorScore: originalResult.vectorScore,
                        bm25Score: originalResult.bm25Score,
                        combinedScore: originalResult.combinedScore,
                        rrfScore: rrfScore,
                    },
                };
            });

        return rerankedResults;
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
        this.vectorStores.clear();
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
        faiss: {
            ...config.faiss,
            storagePath: config.faiss?.storagePath ?? "./faiss_storage",
            autoSave: config.faiss?.autoSave ?? true,
            saveInterval: config.faiss?.saveInterval ?? 300000,
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
        embeddings: createEmbeddings({
            apiUrl: config.lmStudioApiUrl ?? "http://localhost:1234/v1",
            modelName: "text-embedding-nomic-embed-text-v1.5",
        }),
    };

    return new RAGModule(defaultConfig);
}
