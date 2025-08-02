import { BaseReasoningStrategy } from "./base-strategy";
import { ReasoningResult } from "../types";

export class SkeletonOfThoughtStrategy extends BaseReasoningStrategy {
    async execute(
        query: string,
        context: string,
        chatId?: string
    ): Promise<ReasoningResult> {
        const analysisPrompt = `Categorize this question's information type and identify main components.

Question: "${query}"
${context ? `Context: ${context}` : ""}

Information type and main components:`;

        const analysisResponse = await this.queryLLM(
            analysisPrompt,
            0.1,
            chatId,
            "component_analysis"
        );

        const categoriesPrompt = `Break down into factual categories based on this analysis.

Analysis: ${analysisResponse.content}
${context ? `Context: ${context}` : ""}

List clear, distinct fact categories:`;

        const categoriesResponse = await this.queryLLM(
            categoriesPrompt,
            0.1,
            chatId,
            "fact_categorization"
        );

        const structuredPrompt = `Provide an organized answer addressing each category.

Question: "${query}"
Fact categories: ${categoriesResponse.content}
${context ? `Context: ${context}` : ""}

Structured answer addressing each category:`;

        const structuredResponse = await this.queryLLM(
            structuredPrompt,
            0.3,
            chatId,
            "structured_answer"
        );

        return {
            result: structuredResponse.content,
            confidence: Math.min(0.85, structuredResponse.confidence),
        };
    }
}
