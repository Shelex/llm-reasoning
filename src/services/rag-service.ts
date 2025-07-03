import { Document } from "langchain/document";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { RAGContext } from "../types";
import { LocalEmbeddings } from "./local-embeddings";
import { KeyPointExtractor } from "../rag/key-point-extractor";
import { LMStudioClient } from "./lm-studio-client";

export class RAGService {
    private vectorStore!: MemoryVectorStore;
    private readonly embeddings: LocalEmbeddings;
    private readonly textSplitter: RecursiveCharacterTextSplitter;
    private readonly contexts: Map<string, RAGContext[]> = new Map();
    private initialized = false;
    private readonly maxContextsPerChat = 20;
    private readonly maxContextAge = 30 * 60 * 1000; // 30m
    private cleanupInterval?: NodeJS.Timeout;
    private readonly keyPointExtractor?: KeyPointExtractor;

    constructor(private readonly llmClient: LMStudioClient) {
        this.embeddings = new LocalEmbeddings();

        this.textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 300,
            chunkOverlap: 50,
        });

        this.keyPointExtractor = new KeyPointExtractor(this.llmClient);
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        await this.embeddings.initialize();
        await this.initializeVectorStore();

        const cleanupInterval = this.maxContextAge / 2;
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldContexts();
        }, cleanupInterval);

        this.initialized = true;
    }

    async shutdown(): Promise<void> {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }
        this.contexts.clear();
        this.keyPointExtractor?.clearCache();
        this.initialized = false;
    }

    private async initializeVectorStore(): Promise<void> {
        this.vectorStore = new MemoryVectorStore(this.embeddings);
    }

    private ensureInitialized(): void {
        if (!this.initialized) {
            throw new Error("RAGService is not initialized.");
        }
    }

    async addContext(
        chatId: string,
        content: string,
        metadata: Record<string, unknown> = {}
    ): Promise<void> {
        this.ensureInitialized();

        this.cleanOldContexts(chatId);

        const context: RAGContext = {
            id: `${chatId}-${Date.now()}`,
            content: this.compressContentForStorage(content),
            metadata,
            timestamp: new Date(),
        };

        if (!this.contexts.has(chatId)) {
            this.contexts.set(chatId, []);
        }

        const chatContexts = this.contexts.get(chatId)!;
        chatContexts.push(context);

        if (chatContexts.length > this.maxContextsPerChat) {
            chatContexts.shift();
        }

        const chunks = await this.textSplitter.splitText(context.content);
        const documents = chunks.map(
            (chunk, index) =>
                new Document({
                    pageContent: chunk,
                    metadata: {
                        ...metadata,
                        chatId,
                        contextId: context.id,
                        chunkIndex: index,
                        timestamp: context.timestamp.toISOString(),
                    },
                })
        );

        await this.vectorStore.addDocuments(documents);
    }

    async getRelevantContext(
        chatId: string,
        query: string,
        topK: number = 3
    ): Promise<RAGContext[]> {
        this.ensureInitialized();

        const results = await this.vectorStore.similaritySearch(
            query,
            topK * 2
        );

        const contextIds = new Set<string>();
        const relevantContexts: RAGContext[] = [];

        for (const doc of results) {
            if (
                doc.metadata.chatId === chatId &&
                !contextIds.has(doc.metadata.contextId)
            ) {
                const contexts = this.contexts.get(chatId) || [];
                const context = contexts.find(
                    (ctx) => ctx.id === doc.metadata.contextId
                );

                if (context && relevantContexts.length < topK) {
                    contextIds.add(doc.metadata.contextId);
                    const compressedContext =
                        await this.compressContextForRetrieval(context);
                    relevantContexts.push(compressedContext);
                }
            }
        }

        return relevantContexts;
    }

    private async compressContextForRetrieval(
        context: RAGContext
    ): Promise<RAGContext> {
        const compressedContent = await this.extractKeyPoints(
            context.content,
            150
        );
        return {
            ...context,
            content: compressedContent,
        };
    }

    private compressContentForStorage(content: string): string {
        return content
            .replace(/\s+/g, " ")
            .replace(/\n\s*\n/g, "\n")
            .trim();
    }

    private async extractKeyPoints(
        text: string,
        maxLength: number = 500
    ): Promise<string> {
        return this.keyPointExtractor?.extractKeyPoints(text, maxLength) ?? "";
    }

    private cleanOldContexts(chatId: string): void {
        const contexts = this.contexts.get(chatId);
        if (!contexts) return;

        const now = Date.now();
        const filteredContexts = contexts.filter(
            (ctx) => now - ctx.timestamp.getTime() < this.maxContextAge
        );

        if (filteredContexts.length !== contexts.length) {
            this.contexts.set(chatId, filteredContexts);
        }
    }

    async getAllContext(chatId: string): Promise<RAGContext[]> {
        this.ensureInitialized();
        return this.contexts.get(chatId) || [];
    }

    async clearContext(chatId: string): Promise<void> {
        this.ensureInitialized();

        this.contexts.delete(chatId);

        await this.initializeVectorStore();

        for (const [id, contexts] of this.contexts.entries()) {
            for (const context of contexts) {
                const chunks = await this.textSplitter.splitText(
                    context.content
                );
                const documents = chunks.map(
                    (chunk, index) =>
                        new Document({
                            pageContent: chunk,
                            metadata: {
                                ...context.metadata,
                                chatId: id,
                                contextId: context.id,
                                chunkIndex: index,
                                timestamp: context.timestamp.toISOString(),
                            },
                        })
                );
                await this.vectorStore.addDocuments(documents);
            }
        }
    }

    async summarizeContext(chatId: string): Promise<string> {
        this.ensureInitialized();

        const contexts = this.contexts.get(chatId) || [];
        if (contexts.length === 0) return "";

        const recentContexts = contexts
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, 5);

        const compressedContexts = await Promise.all(
            recentContexts.map((ctx) => this.extractKeyPoints(ctx.content, 100))
        );

        return compressedContexts.join(" | ");
    }

    cleanupOldContexts(): void {
        this.ensureInitialized();

        const now = Date.now();
        for (const [chatId, contexts] of this.contexts.entries()) {
            const filteredContexts = contexts.filter(
                (ctx) => now - ctx.timestamp.getTime() < this.maxContextAge
            );

            if (filteredContexts.length === 0) {
                this.contexts.delete(chatId);
            } else if (filteredContexts.length !== contexts.length) {
                this.contexts.set(chatId, filteredContexts);
            }
        }
    }

    getMemoryStats(): {
        totalChats: number;
        totalContexts: number;
        avgContextsPerChat: number;
    } {
        const totalChats = this.contexts.size;
        const totalContexts = Array.from(this.contexts.values()).reduce(
            (sum, contexts) => sum + contexts.length,
            0
        );
        const avgContextsPerChat =
            totalChats > 0 ? totalContexts / totalChats : 0;

        return { totalChats, totalContexts, avgContextsPerChat };
    }
}
