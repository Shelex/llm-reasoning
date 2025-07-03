import { BaseReasoningStrategy } from "./base-strategy";
import { ReasoningResult } from "../types";
import { ResponseParser } from "../parsers";

export class ConstrainedChainOfThoughtStrategy extends BaseReasoningStrategy {
    async execute(query: string, context: string): Promise<ReasoningResult> {
        const constraintPrompt = `Identify critical accuracy requirements for this question.

Question: "${query}"
${context ? `Context: ${context}` : ""}

Critical accuracy constraints and requirements:`;

        const constraintResponse = await this.queryLLM(constraintPrompt, 0.05);

        const verificationPrompt = `Apply strict verification to identify only 100% certain facts.

Question: "${query}"
Accuracy constraints: ${constraintResponse.content}

List only facts you are absolutely certain about:`;

        const verificationResponse = await this.queryLLM(
            verificationPrompt,
            0.01
        );

        const constrainedPrompt = `Answer using only the rigorously verified facts.

Question: "${query}"
Verified facts: ${verificationResponse.content}

Precise answer using only verified facts:`;

        const constrainedResponse = await this.queryLLM(constrainedPrompt, 0.1);

        return {
            result: ResponseParser.filterThinkBlocks(
                constrainedResponse.content
            ),
            confidence: Math.min(0.95, constrainedResponse.confidence),
        };
    }
}
