import { BaseReasoningStrategy } from "./base-strategy";
import { ReasoningResult } from "../types";

export class ChainOfThoughtStrategy extends BaseReasoningStrategy {
    async execute(
        query: string,
        context: string,
        chatId?: string
    ): Promise<ReasoningResult> {
        const factIdPrompt = `What specific facts are needed to answer this question?

Question: "${query}"
${context ? `Context: ${context}` : ""}

List the key facts required for a complete answer:`;

        const factIdResponse = await this.queryLLM(
            factIdPrompt,
            0.1,
            chatId,
            "fact_identification"
        );

        const knowledgeCheckPrompt = `Which of these facts do you know with high certainty?

Required facts: ${factIdResponse.content}

List only facts you're confident about. If uncertain, say so:`;

        const knowledgeResponse = await this.queryLLM(
            knowledgeCheckPrompt,
            0.05,
            chatId,
            "knowledge_check"
        );

        const answerPrompt = `Answer this question using only the verified facts below.

Question: "${query}"
Verified facts: ${knowledgeResponse.content}

Provide a clear, complete answer using only these facts. If facts are insufficient, acknowledge what's missing:`;

        const answerResponse = await this.queryLLM(
            answerPrompt,
            0.2,
            chatId,
            "answer_generation"
        );

        return {
            result: answerResponse.content,
            confidence: Math.min(0.9, answerResponse.confidence),
        };
    }
}
