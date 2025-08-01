import { LLMClient } from "../services/llm";

export class AnswerBeautifier {
    constructor(private readonly llmClient: LLMClient) {}

    async beautifyAnswer(
        originalQuery: string,
        rawAnswer: string,
        chatId?: string
    ): Promise<string> {
        const beautifyPrompt = `Answer the following question with a direct, clear, and concise response:

Question: "${originalQuery}"
Raw Answer: "${rawAnswer}"

Instructions:
- State the answer directly and clearly in the first sentence.
- Only add factual context or brief explanation **if it directly clarifies the answer**.
- Do not include additional background, mechanisms, or unrelated details unless specifically asked.
- Do not repeat the question or provide generic introductory sentences.
- Keep the tone professional and human.
- Do not add any commentary, disclaimers, or extraneous details outside of what is necessary to give the answer.

Write your answer below:`;

        const response = await this.llmClient.queryLLM(
            beautifyPrompt,
            0.4,
            chatId,
            "beautify"
        );
        return response.content;
    }
}
