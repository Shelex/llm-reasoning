import axios, { AxiosInstance } from "axios";
import { LLMClient, LLMResponse } from "../../types";
import { ResponseFilter } from "../../utils/response-filter";
import { ConfidenceCalculator } from "../../llm/confidence-calculator";
import { ChatLogger } from "../../logging/chat";

export class OpenRouterClient implements LLMClient {
    private readonly client: AxiosInstance;
    readonly baseUrl: string;
    private readonly model: string;
    private readonly confidenceCalculator: ConfidenceCalculator;
    private readonly chatLogger: ChatLogger;

    constructor(
        apiKey: string,
        model: string,
        baseUrl: string = "https://openrouter.ai/api/v1"
    ) {
        this.baseUrl = baseUrl;
        this.model = model;

        console.log(`Using OpenRouter model: ${this.model}`);

        this.client = axios.create({
            baseURL: baseUrl,
            timeout: 120 * 1000,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
                "X-Title": "LLM Reasoning App",
            },
        });
        this.confidenceCalculator = new ConfidenceCalculator(this);
        this.chatLogger = new ChatLogger();
    }

    async queryLLM(
        prompt: string,
        temperature: number = 0.2,
        chatId?: string,
        stage?: string
    ): Promise<LLMResponse> {
        try {
            const response = await this.client.post("/chat/completions", {
                model: this.model,
                messages: [
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                temperature,
                stream: false,
            });

            const content = response.data.choices[0]?.message?.content ?? "";

            const confidence = await this.confidenceCalculator.calculateWithLLM(
                content
            );

            const llmResponse: LLMResponse = {
                content: ResponseFilter.filterThinkBlocks(content),
                confidence,
                metadata: {
                    model: response.data.model,
                    usage: response.data.usage,
                },
            };

            if (chatId) {
                await this.chatLogger.logChatInteraction({
                    timestamp: new Date(),
                    chatId,
                    prompt,
                    temperature,
                    response: llmResponse,
                    stage,
                });
            }

            return llmResponse;
        } catch (error) {
            console.error("OpenRouter API error:", error);
            throw new Error(`Failed to query LLM: ${error}`);
        }
    }

    async queryLLMRaw(prompt: string, temperature: number) {
        return this.client.post("/chat/completions", {
            model: this.model,
            messages: [{ role: "user", content: prompt }],
            temperature,
            stream: false,
        });
    }

    async isAvailable(): Promise<boolean> {
        try {
            await this.client.get("/models");
            return true;
        } catch {
            return false;
        }
    }
}
