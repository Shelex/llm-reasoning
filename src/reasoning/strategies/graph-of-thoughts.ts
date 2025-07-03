import { BaseReasoningStrategy } from "./base-strategy";
import { ReasoningResult } from "../types";
import { ResponseParser } from "../parsers";

export class GraphOfThoughtsStrategy extends BaseReasoningStrategy {
    async execute(query: string, context: string): Promise<ReasoningResult> {
        const primaryPrompt = `Identify core, indisputable facts related to this question.

Question: "${query}"
${context ? `Context: ${context}` : ""}

Core facts only (universally accepted, not subject to debate):`;

        const primaryResponse = await this.queryLLM(primaryPrompt, 0.05);

        const crossRefPrompt = `Cross-reference these facts against common knowledge for consistency.

Facts: ${primaryResponse.content}

Consistency check and any issues found:`;

        const crossRefResponse = await this.queryLLM(crossRefPrompt, 0.1);

        const multiSourcePrompt = `Assess multi-source reliability of these facts.

Facts: ${primaryResponse.content}
Consistency: ${crossRefResponse.content}

Multi-source verification assessment:`;

        const multiSourceResponse = await this.queryLLM(multiSourcePrompt, 0.1);

        const finalPrompt = `Provide final answer using thoroughly verified facts.

Question: "${query}"
Verified facts: ${multiSourceResponse.content}

Thoroughly verified answer:`;

        const finalResponse = await this.queryLLM(finalPrompt, 0.2);

        return {
            result: ResponseParser.filterThinkBlocks(finalResponse.content),
            confidence: Math.min(0.98, finalResponse.confidence),
        };
    }
}
