import { LMStudioClient } from "../services/lm-studio-client";
import { ResponseFilter } from "../utils/response-filter";

export class AnswerBeautifier {
    constructor(private readonly llmClient: LMStudioClient) {}

    async beautifyAnswer(
        originalQuery: string,
        rawAnswer: string
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

Improved answer:`;

        const response = await this.llmClient.queryLLM(beautifyPrompt, 0.4);
        return ResponseFilter.filterThinkBlocks(response.content);
    }
}
