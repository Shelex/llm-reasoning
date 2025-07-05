import { LMStudioClient } from "../services/lm-studio-client";
import { ResponseFilter } from "../utils/response-filter";

export class KeyPointExtractor {
    private readonly llmClient: LMStudioClient;
    private readonly cache = new Map<string, string>();

    constructor(llmClient: LMStudioClient) {
        this.llmClient = llmClient;
    }

    async extractKeyPoints(
        text: string,
        chatId: string,
        attempt = 1
    ): Promise<string> {
        try {
            const extractedPoints = await this.extractWithLLM(text, chatId);
            this.updateCache(chatId, extractedPoints);
            return extractedPoints;
        } catch (error) {
            console.warn(
                "LLM key point extraction failed, using fallback:",
                error
            );
            if (attempt <= 3) {
                console.log(
                    `Retrying key point extraction (attempt ${attempt + 1})...`
                );
                return this.extractKeyPoints(text, chatId, attempt + 1);
            }

            console.error("Max attempts reached, returning empty result.");
            return "";
        }
    }

    async mergeAndCompactContext(
        existingContext: string,
        newContent: string,
        chatId: string,
        attempt = 1
    ): Promise<string> {
        try {
            const compactedContent = await this.mergeAndCompactWithLLM(
                existingContext,
                newContent,
                chatId
            );
            this.updateCache(chatId, compactedContent);
            return compactedContent;
        } catch (error) {
            console.warn("LLM context merging failed, using fallback:", error);
            if (attempt <= 3) {
                console.log(
                    `Retrying context merging (attempt ${attempt + 1})...`
                );
                return this.mergeAndCompactContext(
                    existingContext,
                    newContent,
                    chatId,
                    attempt + 1
                );
            }
            console.error("Max attempts reached, returning existing context.");
            return existingContext;
        }
    }

    private async extractWithLLM(
        text: string,
        chatId: string
    ): Promise<string> {
        const prompt = `Extract the most important key points from this text.
Text: "${text}"
Requirements:
- Extract only the most critical information
- Keep response very short
- Prioritize facts, numbers, names, and conclusions
- Maintain factual accuracy
- Use concise language
- Avoid unnecessary details or explanations
- Do not include any reasoning or explanations
- Do not use bullet points or lists
- Do not include any introductory phrases
Key points:`;

        const response = await this.llmClient.queryLLM(
            prompt,
            0.1,
            chatId,
            "extract_key_points"
        );
        const extracted = ResponseFilter.filterThinkBlocks(response.content);

        return extracted;
    }

    private async mergeAndCompactWithLLM(
        existingContext: string,
        newContent: string,
        chatId: string
    ): Promise<string> {
        const prompt = `Merge and compact this information into a single, concise context.

Existing context: "${existingContext}"
New content: "${newContent}"

Requirements:
- Merge both pieces of information intelligently
- Remove redundant information
- Remove duplicate facts
- Prioritize the most important facts and insights
- Maintain factual accuracy
- Use concise language
- Do not include any reasoning or explanations
- Do not use bullet points or lists
- Do not include any introductory phrases
- Keep the result context under 500 characters

Merged and compacted context:`;

        const response = await this.llmClient.queryLLM(
            prompt,
            0.1,
            chatId,
            "merge_compact_context"
        );
        const merged = ResponseFilter.filterThinkBlocks(response.content);

        return merged;
    }

    private updateCache(key: string, value: string): void {
        this.cache.set(key, value);
    }

    clearCache(): void {
        this.cache.clear();
    }
}
