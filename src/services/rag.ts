import { RAGContext } from "../types";
import { RAGModule, createRAGModule } from "../rag";
import { Document } from "@langchain/core/documents";

export interface RAGServiceConfig {
    topK: number;
    enableLogging: boolean;
    collectionName: string;
    lmStudioApiUrl?: string;
}

export class RAGService {
    private readonly ragModule: RAGModule;
    private readonly config: RAGServiceConfig;
    private initialized = false;

    constructor(config?: Partial<RAGServiceConfig>) {
        this.config = {
            topK: 10,
            enableLogging: false,
            collectionName: "rag_collection",
            lmStudioApiUrl: "http://localhost:1234/v1",
            ...config,
        };

        this.ragModule = createRAGModule({
            lmStudioApiUrl: this.config.lmStudioApiUrl!,
        });
    }

    async initialize(documents: Document[] = []): Promise<void> {
        if (this.initialized) return;

        if (documents.length > 0) {
            await this.ragModule.initialize(documents);
        }

        this.initialized = true;
    }

    async shutdown(): Promise<void> {
        await this.ragModule.reset();
        this.initialized = false;
    }

    async addContext(
        chatId: string,
        content: string,
        metadata: Record<string, unknown> = {}
    ): Promise<void> {
        this.ensureInitialized();

        const document = new Document({
            pageContent: content,
            metadata: {
                ...metadata,
                chatId,
                addedAt: new Date().toISOString(),
            },
        });

        await this.ragModule.addContext(chatId, document);
    }

    async getRelevantContext(
        chatId: string,
        query: string,
        topK: number = 10
    ): Promise<RAGContext[]> {
        this.ensureInitialized();

        const results = await this.ragModule.getRelevantContext(
            chatId,
            query,
            topK
        );

        return results.map((result) => ({
            id: result.document.metadata?.id || Math.random().toString(36),
            content: result.document.pageContent,
            metadata: result.document.metadata || {},
            timestamp: new Date(
                result.document.metadata?.addedAt || Date.now()
            ),
        }));
    }

    async clearContext(chatId: string): Promise<void> {
        this.ensureInitialized();
        await this.ragModule.clearContext(chatId);
    }

    async getAllContext(chatId: string): Promise<RAGContext[]> {
        this.ensureInitialized();

        const documents = this.ragModule.getAllDocumentsForChat(chatId);
        return documents.map((doc) => ({
            id: doc.metadata?.id || Math.random().toString(36),
            content: doc.pageContent,
            metadata: doc.metadata || {},
            timestamp: new Date(doc.metadata?.addedAt || Date.now()),
        }));
    }

    getMemoryStats(): {
        totalChats: number;
        totalDocuments: number;
        initialized: boolean;
    } {
        const stats = this.ragModule.getStatistics();

        return {
            totalChats: stats.chatContextCount,
            totalDocuments: stats.totalDocuments,
            initialized: this.initialized,
        };
    }

    updateConfig(newConfig: Partial<RAGServiceConfig>): void {
        Object.assign(this.config, newConfig);
    }

    getConfig(): RAGServiceConfig {
        return { ...this.config };
    }

    private ensureInitialized(): void {
        if (!this.initialized) {
            throw new Error(
                "RAGService is not initialized. Call initialize() first."
            );
        }
    }

    async healthCheck(): Promise<{
        status: "healthy" | "degraded" | "unhealthy";
        components: {
            ragModule: boolean;
            contextStore: boolean;
        };
        memoryUsage: any;
        errors: string[];
    }> {
        const errors: string[] = [];
        const components = {
            ragModule: true,
            contextStore: true,
        };

        try {
            const healthStatus = await this.ragModule.getHealthStatus();
            components.ragModule = healthStatus.status === "healthy";
            if (healthStatus.status !== "healthy") {
                errors.push(`RAG Module: ${healthStatus.status}`);
            }
        } catch (error) {
            components.ragModule = false;
            errors.push(`RAG Module: ${error}`);
        }

        const memoryUsage = this.getMemoryStats();

        const healthyComponents =
            Object.values(components).filter(Boolean).length;
        const totalComponents = Object.keys(components).length;

        let status: "healthy" | "degraded" | "unhealthy" = "healthy";
        if (healthyComponents < totalComponents) {
            status =
                healthyComponents > totalComponents * 0.5
                    ? "degraded"
                    : "unhealthy";
        }

        return {
            status,
            components,
            memoryUsage,
            errors,
        };
    }
}
