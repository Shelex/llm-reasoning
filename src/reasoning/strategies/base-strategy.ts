import { LMStudioClient } from "../../services/lm-studio-client";
import { ReasoningResult, ReasoningExecutor } from "../types";

export abstract class BaseReasoningStrategy implements ReasoningExecutor {
    protected readonly llmClient: LMStudioClient;

    constructor(llmClient: LMStudioClient) {
        this.llmClient = llmClient;
    }

    abstract execute(
        query: string,
        context: string,
        temperature: number
    ): Promise<ReasoningResult>;

    protected async queryLLM(
        prompt: string,
        temperature: number
    ): Promise<{ content: string; confidence: number }> {
        const response = await this.llmClient.queryLLM(prompt, temperature);
        return {
            content: response.content,
            confidence: response.confidence ?? 0.5,
        };
    }
}
