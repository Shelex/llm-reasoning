import { LMStudioClient } from "../services/lm-studio-client";

export class ConfidenceCalculator {
    constructor(private readonly llmClient: LMStudioClient) {}

    async calculateWithLLM(content: string): Promise<number> {
        if (!content || content.trim().length === 0) return 0;

        try {
            const confidencePrompt = `Rate the confidence level of this response from 0.0 to 1.0:

"${content}"

Consider:
- Factual accuracy
- Certainty of language used
- Completeness of answer
- Presence of uncertainty words
- Do not specify the reasoning process, just provide a confidence score.

Respond with only a number (e.g., 0.85)`;

            const response = await this.llmClient.queryLLMRaw(
                confidencePrompt,
                0.05,
                10
            );
            const confidenceText =
                response.data.choices[0]?.message?.content || "";
            const confidenceScore = parseFloat(confidenceText.trim());

            if (isNaN(confidenceScore)) {
                return this.fallbackCalculation(content);
            }

            return Math.max(0, Math.min(1, confidenceScore));
        } catch (error) {
            console.warn(
                "Failed to calculate confidence with LLM, using fallback:",
                error
            );
            return this.fallbackCalculation(content);
        }
    }

    private fallbackCalculation(content: string): number {
        if (!content || content.trim().length === 0) return 0;

        const uncertainPhrases = [
            "i think",
            "maybe",
            "perhaps",
            "possibly",
            "might",
            "could be",
            "i'm not sure",
            "unclear",
            "uncertain",
            "probably",
            "i don't know",
        ];

        const lowerContent = content.toLowerCase();
        const uncertaintyCount = uncertainPhrases.reduce((count, phrase) => {
            return count + (lowerContent.includes(phrase) ? 1 : 0);
        }, 0);

        let confidence = 0.7;
        confidence -= uncertaintyCount * 0.15;

        if (
            lowerContent.includes("is") ||
            lowerContent.includes("are") ||
            (lowerContent.includes("the") && !lowerContent.includes("might"))
        ) {
            confidence += 0.1;
        }

        return Math.max(0.1, Math.min(1, confidence));
    }
}
