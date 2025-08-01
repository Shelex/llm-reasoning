import {
    createOpenAICompatible,
    OpenAICompatibleProviderSettings,
} from "@ai-sdk/openai-compatible";
import { generateObject, generateText, LanguageModelV1 } from "ai";
import { LLMResponse } from "../../types";
import { ConfidenceCalculator } from "./confidence";
import { ChatLogger } from "../../logging/chat";

export type LLMConfig = OpenAICompatibleProviderSettings & { model: string };

export class LLMClient {
    private readonly config: OpenAICompatibleProviderSettings & {
        model: string;
    };
    private readonly confidenceCalculator: ConfidenceCalculator;
    private readonly chatLogger: ChatLogger;
    private readonly model: LanguageModelV1;
    private readonly modelJSON: LanguageModelV1;

    constructor(config: LLMConfig) {
        console.log(config);
        const provider = createOpenAICompatible({
            ...config,
        });

        // setup model with config that supports structured outputs
        // otherwise it would try to convert plain text to json as well
        this.modelJSON = provider(
            config.model,
            {},
            {
                provider: config.name,
                url: ({ path }) => {
                    const url = new URL(`http://localhost:1234/v1${path}`);
                    return url.toString();
                },
                headers: () => ({}),
                supportsStructuredOutputs: true,
            }
        );

        this.model = provider(config.model);

        console.log(this.model.modelId);

        this.config = config;
        this.confidenceCalculator = new ConfidenceCalculator(this);
        this.chatLogger = new ChatLogger();

        console.log(`Using ${config.name} with model: ${config.model}`);
    }

    async queryLLM(
        prompt: string,
        temperature: number = 0.2,
        chatId?: string,
        stage?: string
    ): Promise<LLMResponse> {
        try {
            const { text, usage } = await generateText({
                model: this.model,
                prompt,
                temperature,
            });

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
                    model: this.model,
                    provider: this.config.name,
                    usage: {
                        prompt_tokens: usage.promptTokens || 0,
                        completion_tokens: usage.completionTokens || 0,
                        total_tokens: usage.totalTokens || 0,
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
        schema: any,
        temperature: number = 0.2,
        chatId?: string,
        stage?: string
    ): Promise<{ data: ReturnType; response: LLMResponse }> {
        try {
            const { object, usage } = await generateObject<ReturnType>({
                model: this.modelJSON,
                prompt,
                schema,
                temperature,
                system: "Please generate only the JSON output. DO NOT provide any preamble.",
                mode: "json",
                maxRetries: 3,
            });

            let confidence = 0.8;
            try {
                confidence =
                    stage !== "confidence_calculation"
                        ? await this.confidenceCalculator.calculateWithLLM(
                              JSON.stringify(object)
                          )
                        : 1;
            } catch (error) {
                console.warn(
                    "Confidence calculation failed, using default:",
                    error
                );
            }

            const llmResponse: LLMResponse = {
                content: JSON.stringify(object, null, 2),
                confidence,
                metadata: {
                    model: this.model,
                    provider: this.config.name,
                    usage: {
                        prompt_tokens: usage.promptTokens || 0,
                        completion_tokens: usage.completionTokens || 0,
                        total_tokens: usage.totalTokens || 0,
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

            return { data: object, response: llmResponse };
        } catch (error) {
            console.error(`${this.config.name} structured API error:`, error);
            throw new Error(`Failed to query LLM with schema: ${error}`);
        }
    }

    async queryLLMRaw(prompt: string, temperature: number): Promise<any> {
        const { text, usage } = await generateText({
            model: this.model,
            prompt,
            temperature,
        });

        return {
            content: text,
            usage_metadata: {
                prompt_tokens: usage.promptTokens || 0,
                completion_tokens: usage.completionTokens || 0,
                total_tokens: usage.totalTokens || 0,
            },
            response_metadata: {},
        };
    }

    async isAvailable(): Promise<boolean> {
        try {
            await generateText({
                model: this.model,
                prompt: "test",
            });
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

    const config: OpenAICompatibleProviderSettings & { model: string } = {
        name,
        baseURL,
        apiKey: process.env.LLM_API_KEY ?? undefined,
        model: process.env.LLM_MODEL ?? "local-model",
    };

    console.log(config);

    return new LLMClient(config);
}
