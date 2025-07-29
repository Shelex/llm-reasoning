import { ChatOpenAI } from "@langchain/openai";
import { LLMResponse } from "../../types";
import { ResponseFilter } from "../../utils/response-filter";
import { ConfidenceCalculator } from "./confidence";
import { ChatLogger } from "../../logging/chat";

export interface LLMConfig {
    provider: "lmstudio" | "openrouter";
    baseURL: string;
    apiKey?: string;
    model: string;
    temperature?: number;
}

export class LLMClient {
    private readonly llm: ChatOpenAI;
    readonly baseUrl: string;
    private readonly config: LLMConfig;
    private readonly confidenceCalculator: ConfidenceCalculator;
    private readonly chatLogger: ChatLogger;

    constructor(config: LLMConfig) {
        this.config = config;
        this.baseUrl = config.baseURL;

        const openAIConfig = {
            configuration: {
                baseURL: config.baseURL,
                apiKey: config.apiKey || "not-needed",
            },
            model: config.model,
            temperature: config.temperature ?? 0.2,
            timeout: 120000,
        };

        this.llm = new ChatOpenAI(openAIConfig);
        this.confidenceCalculator = new ConfidenceCalculator(this);
        this.chatLogger = new ChatLogger();

        console.log(`Using ${config.provider} with model: ${config.model}`);
    }

    async queryLLM(
        prompt: string,
        temperature: number = 0.2,
        chatId?: string,
        stage?: string
    ): Promise<LLMResponse> {
        try {
            const llm = new ChatOpenAI({
                configuration: {
                    baseURL: this.config.baseURL,
                    apiKey: this.config.apiKey || "not-needed",
                },
                model: this.config.model,
                temperature,
                timeout: 120000,
            });
            const response = await llm.invoke(prompt);

            const content = response.content as string;

            let confidence = 0.5;
            try {
                confidence =
                    stage !== "confidence_calculation"
                        ? await this.confidenceCalculator.calculateWithLLM(
                              content
                          )
                        : 1;
            } catch (error) {
                console.warn(
                    "Confidence calculation failed, using default:",
                    error
                );
            }

            const llmResponse: LLMResponse = {
                content: ResponseFilter.filterThinkBlocks(content),
                confidence,
                metadata: {
                    model: this.config.model,
                    provider: this.config.provider,
                    usage: response.usage_metadata,
                    response_metadata: response.response_metadata,
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
            console.error(`${this.config.provider} API error:`, error);
            throw new Error(`Failed to query LLM: ${error}`);
        }
    }

    async queryLLMRaw(prompt: string, temperature: number): Promise<any> {
        const tempLLM = new ChatOpenAI({
            configuration: {
                baseURL: this.config.baseURL,
                apiKey: this.config.apiKey || "not-needed",
            },
            model: this.config.model,
            temperature,
            timeout: 120000,
        });
        return await tempLLM.invoke(prompt);
    }

    async isAvailable(): Promise<boolean> {
        try {
            await this.llm.invoke("test");
            return true;
        } catch {
            return false;
        }
    }
}
