export interface ReasoningResult {
    result: string;
    confidence: number;
}

export interface ReasoningExecutor {
    execute(
        query: string,
        context: string,
        temperature: number
    ): Promise<ReasoningResult>;
}
