import { LLMClient } from "../../services/llm/client";
import { ReasoningResult, ReasoningExecutor } from "../types";

export abstract class BaseReasoningStrategy implements ReasoningExecutor {
    protected readonly llmClient: LLMClient;

    constructor(llmClient: LLMClient) {
        this.llmClient = llmClient;
    }

    abstract execute(
        query: string,
        context: string,
        chatId?: string
    ): Promise<ReasoningResult>;

    protected async queryLLM(
        prompt: string,
        temperature: number,
        chatId?: string,
        stage?: string
    ): Promise<{ content: string; confidence: number }> {
        const response = await this.llmClient.queryLLM(
            prompt,
            temperature,
            chatId,
            stage
        );
        return {
            content: response.content,
            confidence: response.confidence ?? 0.5,
        };
    }
}
