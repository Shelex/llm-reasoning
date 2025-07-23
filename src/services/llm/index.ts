import { LLMClient } from "../../types";
import { LMStudioClient } from "./llm-studio";
import { OpenRouterClient } from "./openrouter";

export function createLLMClient(): LLMClient {
    const provider = process.env.LLM_PROVIDER ?? "lmstudio";

    if (provider === "lmstudio") {
        console.log("Using LM Studio as LLM provider");
        return new LMStudioClient(process.env.LM_STUDIO_URL);
    }

    if (provider === "openrouter") {
        console.log("Using OpenRouter as LLM provider");
        const defaultModel = "deepseek/deepseek-chat-v3-0324:free";
        const apiKey = process.env.OPENROUTER_API_KEY;
        const model = process.env.OPENROUTER_MODEL;

        if (!apiKey) {
            throw new Error(
                "OPENROUTER_API_KEY environment variable is required when using OpenRouter"
            );
        }

        if (!model) {
            console.warn(
                `OPENROUTER_MODEL not set, defaulting to '${defaultModel}'`
            );
        }

        return new OpenRouterClient(apiKey, model ?? defaultModel);
    }

    throw new Error(
        `Unsupported LLM provider: ${provider}. Supported providers are: lmstudio, openrouter.`
    );
}
