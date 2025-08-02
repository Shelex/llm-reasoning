import { BaseReasoningStrategy } from "./base-strategy";
import { ReasoningResult } from "../types";

export class GraphOfThoughtsStrategy extends BaseReasoningStrategy {
    async execute(
        query: string,
        context: string,
        chatId?: string
    ): Promise<ReasoningResult> {
        const primaryPrompt = `Identify core, indisputable facts related to this question.

Question: "${query}"
${context ? `Context: ${context}` : ""}

Core facts only (universally accepted, not subject to debate):`;

        const primaryResponse = await this.queryLLM(
            primaryPrompt,
            0.05,
            chatId,
            "primary_facts"
        );

        const crossRefPrompt = `Cross-reference these facts against common knowledge for consistency.

Facts: ${primaryResponse.content}
${context ? `Context: ${context}` : ""}

Consistency check and any issues found:`;

        const crossRefResponse = await this.queryLLM(
            crossRefPrompt,
            0.1,
            chatId,
            "cross_reference"
        );

        const multiSourcePrompt = `Assess multi-source reliability of these facts.

Facts: ${primaryResponse.content}
Consistency: ${crossRefResponse.content}
${context ? `Context: ${context}` : ""}

Multi-source verification assessment:`;

        const multiSourceResponse = await this.queryLLM(
            multiSourcePrompt,
            0.1,
            chatId,
            "multi_source_verification"
        );

        const finalPrompt = `Provide final answer using thoroughly verified facts.

Question: "${query}"
Verified facts: ${multiSourceResponse.content}
${context ? `Context: ${context}` : ""}

Thoroughly verified answer:`;

        const finalResponse = await this.queryLLM(
            finalPrompt,
            0.2,
            chatId,
            "final_answer"
        );

        return {
            result: finalResponse.content,
            confidence: Math.min(0.98, finalResponse.confidence),
        };
    }
}
