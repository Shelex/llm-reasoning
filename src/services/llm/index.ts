import { LLMClient, LLMConfig } from "./client";

export function createLLMClient(): LLMClient {
    const provider = process.env.LLM_PROVIDER ?? "lmstudio";

    if (provider === "lmstudio") {
        const config: LLMConfig = {
            provider: "lmstudio",
            baseURL: process.env.LM_STUDIO_URL ?? "http://localhost:1234/v1",
            model: process.env.LM_STUDIO_MODEL ?? "local-model",
        };

        return new LLMClient(config);
    }

    if (provider === "openrouter") {
        const defaultModel = "deepseek/deepseek-chat-v3-0324:free";
        const apiKey = process.env.OPENROUTER_API_KEY;
        const model = process.env.OPENROUTER_MODEL ?? defaultModel;

        if (!apiKey) {
            throw new Error(
                "OPENROUTER_API_KEY environment variable is required when using OpenRouter"
            );
        }

        const config: LLMConfig = {
            provider: "openrouter",
            baseURL: "https://openrouter.ai/api/v1",
            apiKey,
            model,
        };

        return new LLMClient(config);
    }

    throw new Error(
        `Unsupported LLM provider: ${provider}. Supported providers are: lmstudio, openrouter.`
    );
}
