import { LLMClient } from "./client";
import { ConfidenceSchema, ConfidenceAssessmentResponse } from "../../schemas";

export class ConfidenceCalculator {
    constructor(private readonly llmClient: LLMClient) {}

    async calculateWithLLM(content: string): Promise<number> {
        if (!content || content.trim().length === 0) return 0;

        try {
            return await this.calculateWithStructuredOutput(content);
        } catch (error) {
            console.warn(
                "Failed to calculate confidence with LLM, using fallback:",
                error
            );
            return 0;
        }
    }

    private async calculateWithStructuredOutput(
        content: string
    ): Promise<number> {
        const confidencePrompt = `Rate the confidence level of this response from 0.0 to 1.0:

"${content}"

Consider:
- Factual accuracy
- Certainty of language used
- Completeness of answer
- Presence of uncertainty words

Provide a confidence score between 0.0 and 1.0.

Example response format:
{
  "confidence_score": 0.8,
  "reasoning": {
    "factual_accuracy": 1.0,
    "certainty_of_language": 1.0,
    "completeness_of_answer": 1.0,
    "presence_of_uncertainty_words": 0.0,
    "breakdown": {
      "factual_accuracy": "why this is accurate",
      "certainty_of_language": "how confident the language is",
      "completeness_of_answer": "how complete the answer is",
      "presence_of_uncertainty_words": "are there words indicating uncertainty"
    }
  }
}
`;

        try {
            const { data } =
                await this.llmClient.queryLLMWithSchema<ConfidenceAssessmentResponse>(
                    confidencePrompt,
                    ConfidenceSchema,
                    0.05,
                    undefined,
                    "confidence_calculation"
                );

            return Math.max(0, Math.min(1, data.confidence_score));
        } catch (error) {
            console.warn("Structured confidence calculation failed:", error);
            return 0;
        }
    }
}
