import { LMStudioClient } from "../services/lm-studio-client";
import { ResponseFilter } from "../utils/response-filter";

export class KeyPointExtractor {
    private readonly llmClient: LMStudioClient;
    private readonly cache = new Map<string, string>();
    private readonly maxCacheSize = 100;

    constructor(llmClient: LMStudioClient) {
        this.llmClient = llmClient;
    }

    async extractKeyPoints(
        text: string,
        maxLength: number = 600
    ): Promise<string> {
        if (text.length <= maxLength) return text;

        const cacheKey = `${text.substring(0, 300)}:${maxLength}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey)!;
        }

        try {
            const extractedPoints = await this.extractWithLLM(text, maxLength);
            this.updateCache(cacheKey, extractedPoints);
            return extractedPoints;
        } catch (error) {
            console.warn(
                "LLM key point extraction failed, using fallback:",
                error
            );
            return this.fallbackExtraction(text, maxLength);
        }
    }

    private async extractWithLLM(
        text: string,
        maxLength: number
    ): Promise<string> {
        const prompt = `Extract the most important key points from this text. Focus on facts, conclusions, and essential information.

Text: "${text}"

Requirements:
- Extract only the most critical information
- Keep response under ${maxLength} characters
- Prioritize facts, numbers, names, and conclusions
- Maintain factual accuracy
- Use concise language

Key points:`;

        const response = await this.llmClient.queryLLM(prompt, 0.1);
        const extracted = ResponseFilter.filterThinkBlocks(response.content);

        // Ensure we don't exceed max length
        return extracted.length <= maxLength
            ? extracted
            : extracted.substring(0, maxLength);
    }

    private fallbackExtraction(text: string, maxLength: number): string {
        const sentences = text
            .split(/[.!?]+/)
            .filter((s) => s.trim().length > 5);

        // Prioritize sentences with key information indicators
        const keywordSentences = sentences.filter((sentence) => {
            const s = sentence.toLowerCase();
            return (
                s.includes("currency") ||
                s.includes("capital") ||
                s.includes("official") ||
                s.includes("result") ||
                s.includes("answer") ||
                s.includes("conclusion") ||
                s.includes("because") ||
                s.includes("therefore") ||
                s.includes("is") ||
                s.includes("are") ||
                s.includes("population") ||
                s.includes("located") ||
                s.includes("founded") ||
                s.includes("established")
            );
        });

        let result = "";
        const sentencesToUse =
            keywordSentences.length > 0 ? keywordSentences : sentences;

        for (const sentence of sentencesToUse) {
            const cleanSentence = sentence.trim();
            if (result.length + cleanSentence.length + 2 <= maxLength) {
                result += (result ? ". " : "") + cleanSentence;
            } else {
                break;
            }
        }

        return result || text.substring(0, maxLength);
    }

    private updateCache(key: string, value: string): void {
        if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }
        this.cache.set(key, value);
    }

    clearCache(): void {
        this.cache.clear();
    }
}
