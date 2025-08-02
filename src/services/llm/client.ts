import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { LLMResponse } from "../../types";
import { ConfidenceCalculator } from "./confidence";
import { ChatLogger } from "../../logging/chat";

export interface LLMConfig {
    name: string;
    baseURL: string;
    apiKey?: string;
    model: string;
}

export class LLMClient {
    private readonly config: LLMConfig;
    private readonly confidenceCalculator: ConfidenceCalculator;
    private readonly chatLogger: ChatLogger;
    private readonly apiKey: string;

    constructor(config: LLMConfig) {
        console.log(config);

        this.apiKey = config.apiKey || "dummy-key-for-lm-studio";

        process.env.OPENAI_API_KEY = this.apiKey;

        this.config = config;
        this.confidenceCalculator = new ConfidenceCalculator(this);
        this.chatLogger = new ChatLogger();

        console.log(`Using ${config.name} with model: ${config.model}`);
    }

    private createModelInstance(options?: { temperature?: number }) {
        return new ChatOpenAI({
            modelName: this.config.model,
            openAIApiKey: this.apiKey,
            configuration: {
                baseURL: this.config.baseURL,
                defaultHeaders: this.apiKey
                    ? {}
                    : {
                          Authorization: `Bearer ${this.apiKey}`,
                      },
            },
            temperature: options?.temperature ?? 0.5,
            maxRetries: 3,
        });
    }

    async queryLLM(
        prompt: string,
        temperature: number = 0.2,
        chatId?: string,
        stage?: string
    ): Promise<LLMResponse> {
        try {
            const model = this.createModelInstance({ temperature });

            const response = await model.invoke([
                { role: "user", content: prompt },
            ]);

            const text = response.content as string;
            const usage = (response as any).usage_metadata || {};

            let confidence = 0.5;
            try {
                confidence =
                    stage !== "confidence_calculation"
                        ? await this.confidenceCalculator.calculateWithLLM(text)
                        : 1;
            } catch (error) {
                console.warn(
                    "Confidence calculation failed, using default:",
                    error
                );
            }

            const llmResponse: LLMResponse = {
                content: text,
                confidence,
                metadata: {
                    model: this.config.model,
                    provider: this.config.name,
                    usage: {
                        prompt_tokens: usage.input_tokens || 0,
                        completion_tokens: usage.output_tokens || 0,
                        total_tokens: usage.total_tokens || 0,
                    },
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
            console.error(`${this.config.name} API error:`, error);
            throw new Error(`Failed to query LLM: ${error}`);
        }
    }

    async queryLLMWithSchema<ReturnType = any>(
        prompt: string,
        schema: z.ZodSchema<ReturnType>,
        temperature: number = 0.2,
        chatId?: string,
        stage?: string
    ): Promise<{ data: ReturnType; response: LLMResponse }> {
        try {
            const model = this.createModelInstance({ temperature });

            const structuredModel = model.withStructuredOutput({
                schema,
            });

            const systemMessage =
                "Please generate only valid JSON output that matches the required schema. DO NOT provide any preamble or explanation, just the JSON.";
            const response = await structuredModel.invoke([
                { role: "system", content: systemMessage },
                { role: "user", content: prompt },
            ]);

            const parsedData = response as ReturnType;
            const usage = (response as any).usage_metadata || {};

            let confidence = 0.8;
            try {
                confidence =
                    stage !== "confidence_calculation"
                        ? await this.confidenceCalculator.calculateWithLLM(
                              JSON.stringify(parsedData)
                          )
                        : 1;
            } catch (error) {
                console.warn(
                    "Confidence calculation failed, using default:",
                    error
                );
            }

            const llmResponse: LLMResponse = {
                content: JSON.stringify(parsedData, null, 2),
                confidence,
                metadata: {
                    model: this.config.model,
                    provider: this.config.name,
                    usage: {
                        prompt_tokens: usage.input_tokens || 0,
                        completion_tokens: usage.output_tokens || 0,
                        total_tokens: usage.total_tokens || 0,
                    },
                    structured: true,
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

            return { data: parsedData, response: llmResponse };
        } catch (error) {
            console.error(`${this.config.name} structured API error:`, error);
            throw new Error(`Failed to query LLM with schema: ${error}`);
        }
    }

    async queryLLMRaw(prompt: string, temperature: number): Promise<any> {
        const model = this.createModelInstance({ temperature });

        const response = await model.invoke([
            { role: "user", content: prompt },
        ]);

        const usage = (response as any).usage_metadata || {};

        return {
            content: response.content as string,
            usage_metadata: {
                prompt_tokens: usage.input_tokens || 0,
                completion_tokens: usage.output_tokens || 0,
                total_tokens: usage.total_tokens || 0,
            },
            response_metadata: (response as any).response_metadata || {},
        };
    }

    async isAvailable(): Promise<boolean> {
        try {
            const model = this.createModelInstance();
            await model.invoke([{ role: "user", content: "test" }]);
            return true;
        } catch {
            return false;
        }
    }

    get baseUrl(): string {
        return this.config.baseURL;
    }
}

export function createLLMClient(): LLMClient {
    const baseURL = process.env.LLM_BASE_URL ?? "http://localhost:1234/v1";

    const isLocal =
        baseURL.includes("localhost") || baseURL.includes("127.0.0.1");

    const name = isLocal ? "lmstudio" : "openrouter";

    const config: LLMConfig = {
        name,
        baseURL,
        apiKey: process.env.LLM_API_KEY ?? undefined,
        model: process.env.LLM_MODEL ?? "local-model",
    };

    return new LLMClient(config);
}
