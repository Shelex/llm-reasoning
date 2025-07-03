export class LLMPromptBuilder {
    static buildConfidencePrompt(originalPrompt: string): string {
        return `${originalPrompt}

Provide your answer in this JSON format:
{
  "answer": "Your complete answer here",
  "confidence": 0.85,
  "reasoning": "Brief explanation of confidence level"
}

Guidelines:
- Give a complete, factual answer
- Rate confidence from 0.0 to 1.0
- Explain your confidence level
- Be accurate and acknowledge uncertainty if needed`;
    }
}
