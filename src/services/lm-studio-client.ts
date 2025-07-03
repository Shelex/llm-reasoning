import axios, { AxiosInstance } from "axios";
import { LLMResponse } from "../types";
import { ResponseFilter } from "../utils/response-filter";
import { ConfidenceCalculator } from "../llm/confidence-calculator";
import { LLMPromptBuilder } from "../llm/prompt-builder";

export class LMStudioClient {
    private readonly client: AxiosInstance;
    private readonly baseUrl: string;
    private readonly confidenceCalculator: ConfidenceCalculator;

    constructor(baseUrl: string = "http://localhost:1234") {
        this.baseUrl = baseUrl;
        this.client = axios.create({
            baseURL: baseUrl,
            timeout: 120 * 1000,
            headers: {
                "Content-Type": "application/json",
            },
        });
        this.confidenceCalculator = new ConfidenceCalculator(this);
    }

    async queryLLMWithConfidence(
        prompt: string,
        temperature: number = 0.2,
        maxTokens: number = 1000
    ): Promise<LLMResponse> {
        const confidencePrompt = LLMPromptBuilder.buildConfidencePrompt(prompt);
        return this.queryLLMInternal(confidencePrompt, temperature, maxTokens);
    }

    async queryLLM(
        prompt: string,
        temperature: number = 0.2,
        maxTokens: number = 1000
    ): Promise<LLMResponse> {
        return this.queryLLMInternal(prompt, temperature, maxTokens);
    }

    async queryLLMRaw(prompt: string, temperature: number, maxTokens: number) {
        return this.client.post("/v1/chat/completions", {
            model: "local-model",
            messages: [{ role: "user", content: prompt }],
            temperature,
            max_tokens: maxTokens,
            stream: false,
        });
    }

    private async queryLLMInternal(
        prompt: string,
        temperature: number = 0.2,
        maxTokens: number = 1000
    ): Promise<LLMResponse> {
        try {
            const response = await this.client.post("/v1/chat/completions", {
                model: "local-model",
                messages: [
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                temperature,
                max_tokens: maxTokens,
                stream: false,
            });

            const content = response.data.choices[0]?.message?.content ?? "";

            const confidence = await this.confidenceCalculator.calculateWithLLM(
                content
            );
            return {
                content: ResponseFilter.filterThinkBlocks(content),
                confidence,
                metadata: {
                    model: response.data.model,
                    usage: response.data.usage,
                },
            };
        } catch (error) {
            console.error("LM Studio API error:", error);
            throw new Error(`Failed to query LLM: ${error}`);
        }
    }

    async isAvailable(): Promise<boolean> {
        try {
            await this.client.get("/v1/models");
            return true;
        } catch {
            return false;
        }
    }
}
