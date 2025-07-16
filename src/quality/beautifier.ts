import { LMStudioClient } from "../services/lm-studio-client";
import { ResponseFilter } from "../utils/response-filter";

export class AnswerBeautifier {
    constructor(private readonly llmClient: LMStudioClient) {}

    async beautifyAnswer(
        originalQuery: string,
        rawAnswer: string,
        chatId?: string
    ): Promise<string> {
        const beautifyPrompt = `Transform this answer into natural, conversational language while keeping all facts accurate.

Question: "${originalQuery}"
Answer to improve: "${rawAnswer}"

Make it:
- Sound like a knowledgeable person speaking naturally
- Clear and well-organized
- Professional but friendly
- Keep all facts exactly as they are
- Remove awkward or robotic phrasing
- Avoid symbols or formatting, use just new line, titles, and paragraphs
- Provide an answer that is human-readable and easy to follow

Improved answer:`;

        const response = await this.llmClient.queryLLM(
            beautifyPrompt,
            0.4,
            chatId,
            "beautify"
        );
        return ResponseFilter.filterThinkBlocks(response.content);
    }
}
