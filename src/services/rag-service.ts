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
    private readonly contexts: Map<string, RAGContext> = new Map();
    private initialized = false;
    private readonly maxContextAge = 30 * 60 * 1000; // 30m
    private cleanupInterval?: NodeJS.Timeout;
    private readonly keyPointExtractor: KeyPointExtractor;

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
        this.keyPointExtractor.clearCache();
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
        console.log(
            `📝 [RAG] Adding context for chat ${chatId}: ${content.substring(
                0,
                100
            )}...`
        );

        this.cleanOldContexts(chatId);

        const existingContext = this.contexts.get(chatId);
        let processedContent: string;

        if (existingContext) {
            console.log(
                `🔄 [RAG] Merging new content with existing context for chat ${chatId}`
            );
            processedContent =
                await this.keyPointExtractor.mergeAndCompactContext(
                    existingContext.content,
                    content,
                    chatId
                );
        } else {
            console.log(
                `🆕 [RAG] Extracting key points for new chat ${chatId}`
            );
            processedContent = await this.keyPointExtractor.extractKeyPoints(
                content,
                chatId
            );
        }

        const context: RAGContext = {
            id: `${chatId}-${Date.now()}`,
            content: processedContent,
            metadata: {
                ...metadata,
                originalLength: content.length,
                compressedLength: processedContent.length,
                compressionRatio:
                    content.length > 0
                        ? processedContent.length / content.length
                        : 0,
            },
            timestamp: new Date(),
        };

        this.contexts.set(chatId, context);

        await this.updateVectorStore(chatId, context);

        console.log(
            `✅ [RAG] Context updated for chat ${chatId} (${content.length} → ${processedContent.length} chars)`
        );
    }

    private async updateVectorStore(
        chatId: string,
        context: RAGContext
    ): Promise<void> {
        await this.initializeVectorStore();

        for (const [id, ctx] of this.contexts.entries()) {
            if (id !== chatId) {
                await this.addContextToVectorStore(id, ctx);
            }
        }

        await this.addContextToVectorStore(chatId, context);
    }

    private async addContextToVectorStore(
        chatId: string,
        context: RAGContext
    ): Promise<void> {
        const chunks = await this.textSplitter.splitText(context.content);
        const documents = chunks.map(
            (chunk, index) =>
                new Document({
                    pageContent: chunk,
                    metadata: {
                        ...context.metadata,
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
        topK: number = 10
    ): Promise<RAGContext[]> {
        this.ensureInitialized();
        console.log(
            `🔍 [RAG] Getting relevant context for chat ${chatId}, query: ${query.substring(
                0,
                50
            )}...`
        );

        const context = this.contexts.get(chatId);
        if (!context) {
            console.log(`❌ [RAG] No context found for chat ${chatId}`);
            return [];
        }

        // Since we now have a single compacted context per chat, we can return it directly
        // or perform similarity search if we want to return relevant chunks
        const results = await this.vectorStore.similaritySearch(query, topK);

        const relevantChunks = results.filter(
            (doc) => doc.metadata.chatId === chatId
        );

        if (relevantChunks.length > 0) {
            console.log(
                `✅ [RAG] Retrieved pre-processed context for chat ${chatId} (${relevantChunks.length} chunks)`
            );
            return [context];
        }

        console.log(`❌ [RAG] No relevant context found for chat ${chatId}`);
        return [];
    }

    private cleanOldContexts(chatId: string): void {
        const context = this.contexts.get(chatId);
        if (!context) return;

        const now = Date.now();
        if (now - context.timestamp.getTime() >= this.maxContextAge) {
            this.contexts.delete(chatId);
            console.log(`🧹 [RAG] Removed expired context for chat ${chatId}`);
        }
    }

    async getAllContext(chatId: string): Promise<RAGContext[]> {
        this.ensureInitialized();
        const context = this.contexts.get(chatId);
        return context ? [context] : [];
    }

    async clearContext(chatId: string): Promise<void> {
        this.ensureInitialized();
        console.log(`🧹 [RAG] Clearing context for chat ${chatId}`);

        this.contexts.delete(chatId);

        await this.initializeVectorStore();

        for (const [id, context] of this.contexts.entries()) {
            await this.addContextToVectorStore(id, context);
        }
    }

    async summarizeContext(chatId: string): Promise<string> {
        this.ensureInitialized();

        const context = this.contexts.get(chatId);
        if (!context) return "";

        return context.content;
    }

    cleanupOldContexts(): void {
        this.ensureInitialized();

        const now = Date.now();
        const expiredChats: string[] = [];

        for (const [chatId, context] of this.contexts.entries()) {
            if (now - context.timestamp.getTime() >= this.maxContextAge) {
                expiredChats.push(chatId);
            }
        }

        for (const chatId of expiredChats) {
            this.contexts.delete(chatId);
            console.log(
                `🧹 [RAG] Cleaned up expired context for chat ${chatId}`
            );
        }
    }

    getMemoryStats(): {
        totalChats: number;
        totalContexts: number;
        avgContextsPerChat: number;
        totalCompressedChars: number;
        avgCompressionRatio: number;
    } {
        const totalChats = this.contexts.size;
        const totalContexts = totalChats;
        const avgContextsPerChat = totalChats > 0 ? 1 : 0;

        let totalCompressedChars = 0;
        let totalCompressionRatio = 0;

        for (const context of this.contexts.values()) {
            totalCompressedChars += context.content.length;
            if (context.metadata.compressionRatio) {
                totalCompressionRatio += context.metadata
                    .compressionRatio as number;
            }
        }

        const avgCompressionRatio =
            totalChats > 0 ? totalCompressionRatio / totalChats : 0;

        return {
            totalChats,
            totalContexts,
            avgContextsPerChat,
            totalCompressedChars,
            avgCompressionRatio,
        };
    }
}
