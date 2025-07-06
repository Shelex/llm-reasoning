import { SemanticContext } from "./semantic";

export interface MemoryConfig {
    maxTotalContexts: number;
    maxContextsPerChat: number;
    maxTotalMemoryMB: number;
    cleanupIntervalMs: number;
    maxContextAgeDays: number;
    compressionThreshold: number;
    archivalEnabled: boolean;
    persistenceEnabled: boolean;
}

export interface MemoryStats {
    totalChats: number;
    totalContexts: number;
    totalMemoryMB: number;
    oldestContextAge: number;
    newestContextAge: number;
    averageContextSize: number;
    compressionRatio: number;
    cacheHitRate: number;
    performanceMetrics: {
        avgRetrievalTimeMs: number;
        avgStorageTimeMs: number;
        avgCompressionTimeMs: number;
    };
}

export interface ArchivalContext {
    chatId: string;
    contextId: string;
    content: string;
    metadata: Record<string, unknown>;
    archivedAt: Date;
    originalTimestamp: Date;
    compressionRatio: number;
}

export class MemoryManager {
    private readonly config: MemoryConfig;
    private cleanupInterval?: NodeJS.Timeout;
    private readonly performanceTracking = {
        retrievalTimes: [] as number[],
        storageTimes: [] as number[],
        compressionTimes: [] as number[],
        cacheHits: 0,
        cacheMisses: 0,
    };

    private memoryUsage = 0;
    private readonly archivedContexts = new Map<string, ArchivalContext[]>();
    private readonly accessPatterns = new Map<
        string,
        { lastAccess: Date; accessCount: number }
    >();

    constructor(config?: Partial<MemoryConfig>) {
        this.config = {
            maxTotalContexts: 10000,
            maxContextsPerChat: 50,
            maxTotalMemoryMB: 100,
            cleanupIntervalMs: 5 * 60 * 1000,
            maxContextAgeDays: 7,
            compressionThreshold: 0.3, // 30%
            archivalEnabled: true,
            persistenceEnabled: false,
            ...config,
        };

        this.startCleanupProcess();
    }

    async manageContextStorage(
        chatId: string,
        contexts: Map<string, SemanticContext[]>,
        newContext: SemanticContext
    ): Promise<{ stored: boolean; compressed: boolean; archived: boolean }> {
        const startTime = Date.now();

        try {
            this.updateMemoryUsage(contexts);

            this.trackAccess(chatId);

            const memoryCheck = await this.checkMemoryLimits(contexts);
            if (!memoryCheck.canStore) {
                console.log(
                    `⚠️ [MEMORY] Memory limit exceeded, cleaning up before storage`
                );
                await this.performCleanup(contexts);
            }

            const chatContexts = contexts.get(chatId) || [];
            chatContexts.push(newContext);
            contexts.set(chatId, chatContexts);

            let compressed = false;
            let archived = false;

            if (this.shouldCompress()) {
                compressed = await this.compressOldContexts(contexts);
            }

            if (
                this.config.archivalEnabled &&
                this.shouldArchive(chatContexts)
            ) {
                archived = await this.archiveOldContexts(chatId, chatContexts);
            }

            await this.maintainChatLimits(chatId, contexts);

            this.performanceTracking.storageTimes.push(Date.now() - startTime);
            this.limitArraySize(this.performanceTracking.storageTimes, 100);

            console.log(
                `💾 [MEMORY] Context stored for chat ${chatId} (compressed: ${compressed}, archived: ${archived})`
            );

            return { stored: true, compressed, archived };
        } catch (error) {
            console.error("Context storage failed:", error);
            return { stored: false, compressed: false, archived: false };
        }
    }

    async retrieveContexts(
        chatId: string,
        contexts: Map<string, SemanticContext[]>,
        includeArchived: boolean = false
    ): Promise<SemanticContext[]> {
        const startTime = Date.now();

        try {
            this.trackAccess(chatId);

            const activeContexts = contexts.get(chatId) || [];

            let allContexts = [...activeContexts];
            if (includeArchived && this.config.archivalEnabled) {
                const archivedContexts = await this.retrieveArchivedContexts(
                    chatId
                );
                allContexts = [
                    ...allContexts,
                    ...this.convertArchivedToSemantic(archivedContexts),
                ];
            }

            this.performanceTracking.retrievalTimes.push(
                Date.now() - startTime
            );
            this.limitArraySize(this.performanceTracking.retrievalTimes, 100);

            if (activeContexts.length > 0) {
                this.performanceTracking.cacheHits++;
            } else {
                this.performanceTracking.cacheMisses++;
            }

            console.log(
                `📖 [MEMORY] Retrieved ${allContexts.length} contexts for chat ${chatId}`
            );
            return allContexts;
        } catch (error) {
            console.error("Context retrieval failed:", error);
            return [];
        }
    }

    async performCleanup(contexts: Map<string, SemanticContext[]>): Promise<{
        contextsRemoved: number;
        chatsRemoved: number;
        memoryFreedMB: number;
    }> {
        console.log(`🧹 [MEMORY] Starting memory cleanup process`);

        let contextsRemoved = 0;
        let chatsRemoved = 0;
        const initialMemory = this.memoryUsage;

        const now = Date.now();
        const maxAge = this.config.maxContextAgeDays * 24 * 60 * 60 * 1000;

        for (const [chatId, chatContexts] of contexts.entries()) {
            const validContexts = chatContexts.filter((context) => {
                const age = now - context.timestamp.getTime();
                const isValid = age < maxAge;
                if (!isValid) contextsRemoved++;
                return isValid;
            });

            if (validContexts.length === 0) {
                contexts.delete(chatId);
                chatsRemoved++;
            } else if (validContexts.length !== chatContexts.length) {
                contexts.set(chatId, validContexts);
            }
        }

        if (this.memoryUsage > this.config.maxTotalMemoryMB * 0.8) {
            await this.removeInactiveContexts(contexts);
        }

        if (this.shouldCompress()) {
            await this.compressOldContexts(contexts);
        }

        const memoryFreed = initialMemory - this.memoryUsage;

        console.log(
            `✅ [MEMORY] Cleanup complete: ${contextsRemoved} contexts, ${chatsRemoved} chats, ${memoryFreed.toFixed(
                2
            )}MB freed`
        );

        return {
            contextsRemoved,
            chatsRemoved,
            memoryFreedMB: memoryFreed,
        };
    }

    private async checkMemoryLimits(
        contexts: Map<string, SemanticContext[]>
    ): Promise<{
        canStore: boolean;
        memoryUsagePercent: number;
        contextCountPercent: number;
    }> {
        const totalContexts = Array.from(contexts.values()).reduce(
            (sum, chatContexts) => sum + chatContexts.length,
            0
        );

        const memoryUsagePercent =
            (this.memoryUsage / this.config.maxTotalMemoryMB) * 100;
        const contextCountPercent =
            (totalContexts / this.config.maxTotalContexts) * 100;

        const canStore = memoryUsagePercent < 90 && contextCountPercent < 90;

        return {
            canStore,
            memoryUsagePercent,
            contextCountPercent,
        };
    }

    private updateMemoryUsage(contexts: Map<string, SemanticContext[]>): void {
        let totalSize = 0;

        for (const chatContexts of contexts.values()) {
            for (const context of chatContexts) {
                const contentSize = context.content.length * 2;
                const embeddingSize = context.embedding.length * 8;
                const metadataSize =
                    JSON.stringify(context.metadata).length * 2;

                totalSize += contentSize + embeddingSize + metadataSize + 200;
            }
        }

        this.memoryUsage = totalSize / (1024 * 1024);
    }

    private shouldCompress(): boolean {
        return (
            this.memoryUsage >
            this.config.maxTotalMemoryMB * this.config.compressionThreshold
        );
    }

    private shouldArchive(chatContexts: SemanticContext[]): boolean {
        return chatContexts.length > this.config.maxContextsPerChat * 0.8;
    }

    private async compressOldContexts(
        contexts: Map<string, SemanticContext[]>
    ): Promise<boolean> {
        const startTime = Date.now();
        console.log(`🗜️ [MEMORY] Starting context compression`);

        try {
            let compressedCount = 0;
            const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

            for (const [, chatContexts] of contexts.entries()) {
                for (const context of chatContexts) {
                    if (
                        context.timestamp.getTime() < sevenDaysAgo &&
                        context.content.length > 200
                    ) {
                        const originalLength = context.content.length;
                        context.content = this.compressContent(context.content);

                        const compressionRatio =
                            context.content.length / originalLength;
                        context.metadata.compressed = true;
                        context.metadata.originalLength = originalLength;
                        context.metadata.compressionRatio = compressionRatio;

                        compressedCount++;
                    }
                }
            }

            this.performanceTracking.compressionTimes.push(
                Date.now() - startTime
            );
            this.limitArraySize(this.performanceTracking.compressionTimes, 100);

            console.log(
                `✅ [MEMORY] Compressed ${compressedCount} contexts in ${
                    Date.now() - startTime
                }ms`
            );
            return compressedCount > 0;
        } catch (error) {
            console.error("Context compression failed:", error);
            return false;
        }
    }

    private compressContent(content: string): string {
        return content
            .replace(/\s+/g, " ")
            .replace(
                /\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by)\s+/gi,
                ""
            )
            .replace(/[.,;:!?]+/g, ".")
            .trim();
    }

    private async archiveOldContexts(
        chatId: string,
        chatContexts: SemanticContext[]
    ): Promise<boolean> {
        if (
            !this.config.archivalEnabled ||
            chatContexts.length <= this.config.maxContextsPerChat
        ) {
            return false;
        }

        console.log(`📦 [MEMORY] Archiving old contexts for chat ${chatId}`);

        try {
            const sortedContexts = [...chatContexts].sort(
                (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
            );

            const toArchive = sortedContexts.slice(
                0,
                Math.floor(chatContexts.length * 0.3)
            );
            const archived: ArchivalContext[] = [];

            for (const context of toArchive) {
                archived.push({
                    chatId,
                    contextId: context.id,
                    content: context.content,
                    metadata: context.metadata,
                    archivedAt: new Date(),
                    originalTimestamp: context.timestamp,
                    compressionRatio:
                        (context.metadata.compressionRatio as number) || 1.0,
                });
            }

            const existingArchived = this.archivedContexts.get(chatId) || [];
            this.archivedContexts.set(chatId, [
                ...existingArchived,
                ...archived,
            ]);

            console.log(
                `✅ [MEMORY] Archived ${archived.length} contexts for chat ${chatId}`
            );
            return true;
        } catch (error) {
            console.error("Context archival failed:", error);
            return false;
        }
    }

    private async retrieveArchivedContexts(
        chatId: string
    ): Promise<ArchivalContext[]> {
        return this.archivedContexts.get(chatId) || [];
    }

    private convertArchivedToSemantic(
        archived: ArchivalContext[]
    ): SemanticContext[] {
        return archived.map((arch) => ({
            id: arch.contextId,
            content: arch.content,
            embedding: [],
            semanticHash: "",
            confidence: 0.6,
            contextType: "query_result" as const,
            metadata: {
                ...arch.metadata,
                archived: true,
                archivedAt: arch.archivedAt.toISOString(),
            },
            timestamp: arch.originalTimestamp,
            relevanceScore: 0.5,
        }));
    }

    private async maintainChatLimits(
        chatId: string,
        contexts: Map<string, SemanticContext[]>
    ): Promise<void> {
        const chatContexts = contexts.get(chatId);
        if (
            !chatContexts ||
            chatContexts.length <= this.config.maxContextsPerChat
        ) {
            return;
        }

        const sortedContexts = chatContexts.sort((a, b) => {
            const scoreA = (a.relevanceScore ?? 0) * 0.7 + a.confidence * 0.3;
            const scoreB = (b.relevanceScore ?? 0) * 0.7 + b.confidence * 0.3;
            return scoreB - scoreA;
        });

        const keptContexts = sortedContexts.slice(
            0,
            this.config.maxContextsPerChat
        );
        contexts.set(chatId, keptContexts);

        console.log(
            `🔧 [MEMORY] Trimmed chat ${chatId} to ${keptContexts.length} contexts`
        );
    }

    private async removeInactiveContexts(
        contexts: Map<string, SemanticContext[]>
    ): Promise<void> {
        console.log(`🗑️ [MEMORY] Removing inactive contexts`);

        const chatAccess = Array.from(this.accessPatterns.entries()).sort(
            (a, b) => a[1].lastAccess.getTime() - b[1].lastAccess.getTime()
        );

        const chatsToReduce = chatAccess.slice(
            0,
            Math.ceil(chatAccess.length * 0.2)
        );

        for (const [chatId] of chatsToReduce) {
            const chatContexts = contexts.get(chatId);
            if (chatContexts && chatContexts.length > 5) {
                const reduced = chatContexts.slice(-5);
                contexts.set(chatId, reduced);
            }
        }
    }

    private trackAccess(chatId: string): void {
        const existing = this.accessPatterns.get(chatId);
        this.accessPatterns.set(chatId, {
            lastAccess: new Date(),
            accessCount: (existing?.accessCount ?? 0) + 1,
        });
    }

    private limitArraySize<T>(array: T[], maxSize: number): void {
        if (array.length > maxSize) {
            array.splice(0, array.length - maxSize);
        }
    }

    private startCleanupProcess(): void {
        this.cleanupInterval = setInterval(() => {
            console.log(`⏰ [MEMORY] Periodic cleanup triggered`);
        }, this.config.cleanupIntervalMs);
    }

    getMemoryStats(contexts: Map<string, SemanticContext[]>): MemoryStats {
        this.updateMemoryUsage(contexts);

        const totalContexts = Array.from(contexts.values()).reduce(
            (sum, chatContexts) => sum + chatContexts.length,
            0
        );

        let oldestAge = 0;
        let newestAge = Infinity;
        let totalSize = 0;

        const now = Date.now();
        for (const chatContexts of contexts.values()) {
            for (const context of chatContexts) {
                const age = now - context.timestamp.getTime();
                oldestAge = Math.max(oldestAge, age);
                newestAge = Math.min(newestAge, age);
                totalSize += context.content.length;
            }
        }

        const cacheTotal =
            this.performanceTracking.cacheHits +
            this.performanceTracking.cacheMisses;
        const cacheHitRate =
            cacheTotal > 0
                ? this.performanceTracking.cacheHits / cacheTotal
                : 0;

        return {
            totalChats: contexts.size,
            totalContexts,
            totalMemoryMB: this.memoryUsage,
            oldestContextAge: oldestAge,
            newestContextAge: newestAge === Infinity ? 0 : newestAge,
            averageContextSize:
                totalContexts > 0 ? totalSize / totalContexts : 0,
            compressionRatio: this.calculateCompressionRatio(contexts),
            cacheHitRate,
            performanceMetrics: {
                avgRetrievalTimeMs: this.calculateAverage(
                    this.performanceTracking.retrievalTimes
                ),
                avgStorageTimeMs: this.calculateAverage(
                    this.performanceTracking.storageTimes
                ),
                avgCompressionTimeMs: this.calculateAverage(
                    this.performanceTracking.compressionTimes
                ),
            },
        };
    }

    private calculateCompressionRatio(
        contexts: Map<string, SemanticContext[]>
    ): number {
        let totalOriginal = 0;
        let totalCompressed = 0;
        let compressedCount = 0;

        for (const chatContexts of contexts.values()) {
            for (const context of chatContexts) {
                if (context.metadata.compressed) {
                    totalOriginal +=
                        (context.metadata.originalLength as number) || 0;
                    totalCompressed += context.content.length;
                    compressedCount++;
                }
            }
        }

        return compressedCount > 0 ? totalCompressed / totalOriginal : 1.0;
    }

    private calculateAverage(numbers: number[]): number {
        return numbers.length > 0
            ? numbers.reduce((sum, n) => sum + n, 0) / numbers.length
            : 0;
    }

    updateConfig(newConfig: Partial<MemoryConfig>): void {
        Object.assign(this.config, newConfig);
        console.log("🔧 [MEMORY] Configuration updated");
    }

    getConfig(): MemoryConfig {
        return { ...this.config };
    }

    shutdown(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }

        this.archivedContexts.clear();
        this.accessPatterns.clear();
        console.log("🛑 [MEMORY] Memory manager shutdown complete");
    }
}
