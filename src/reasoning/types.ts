export interface ReasoningResult {
    result: string;
    confidence: number;
}

export interface ReasoningExecutor {
    execute(
        query: string,
        context: string,
        chatId?: string
    ): Promise<ReasoningResult>;
}
