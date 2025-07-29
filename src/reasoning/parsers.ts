import { SubTask, ReasoningStrategy } from "../types";
import { ResponseFilter } from "../utils/response-filter";

export class ResponseParser {
    static filterThinkBlocks(content: string): string {
        return ResponseFilter.filterThinkBlocks(content);
    }

    static parseDecomposition(content: string): { plan: SubTask[] } {
        const jsonResult = this.tryParseJSON(content);
        if (jsonResult) {
            return jsonResult;
        }

        const markdownResult = this.tryParseMarkdownJSON(content);
        if (markdownResult) {
            return markdownResult;
        }

        const regexResult = this.tryRegexExtraction(content);
        if (regexResult) {
            return regexResult;
        }

        console.log(
            `No valid JSON found in content: ${content}, returning complete response`
        );
        return {
            plan: [
                {
                    id: "1",
                    query: content.trim(),
                    status: "pending" as const,
                },
            ],
        };
    }

    private static tryParseJSON(content: string): { plan: SubTask[] } | null {
        try {
            const parsed = JSON.parse(content);
            if (!parsed.plan || !Array.isArray(parsed.plan)) {
                return null;
            }

            const validSubTasks = parsed.plan
                .filter(
                    (task: any) =>
                        task && typeof task === "object" && task.query
                )
                .map((task: any, index: number) => ({
                    id: task.id ?? String(index + 1),
                    query: this.extractCleanQuery(task.query),
                    status: "pending" as const,
                }));

            if (validSubTasks.length === 0) {
                return null;
            }

            return { plan: validSubTasks };
        } catch (error) {
            console.error("failed to parse JSON:", error);
            return this.tryParseJSONFallback(content);
        }
    }

    private static tryParseJSONFallback(
        content: string
    ): { plan: SubTask[] } | null {
        try {
            const cleanContent = content
                .replace(/,\s*}/g, "}")
                .replace(/,\s*]/g, "]")
                .replace(/([{,]\s*)(\w+):/g, '$1"$2":')
                .replace(/:\s*'([^']*)'/g, ': "$1"');

            const parsed = JSON.parse(cleanContent);
            if (parsed.plan && Array.isArray(parsed.plan)) {
                return {
                    plan: parsed.plan
                        .filter((task: any) => task?.query)
                        .map((task: any, index: number) => ({
                            id: task.id ?? String(index + 1),
                            query: this.extractCleanQuery(task.query),
                            status: "pending" as const,
                        })),
                };
            }
        } catch (fallbackError) {
            console.warn("JSON fallback parsing also failed:", fallbackError);
        }
        return null;
    }

    private static tryParseMarkdownJSON(
        content: string
    ): { plan: SubTask[] } | null {
        const jsonRegex = new RegExp(
            "```(?:json)?\\s*(\\{[\\s\\S]*?\\})\\s*```"
        );
        const jsonMatch = jsonRegex.exec(content);
        if (jsonMatch) {
            return this.tryParseJSON(jsonMatch[1]);
        }
        return null;
    }

    private static tryRegexExtraction(
        content: string
    ): { plan: SubTask[] } | null {
        const jsonObjectRegex = /\{[^{}]*"plan"[^{}]*\[[^\]]*\][^{}]*\}/gs;
        const matches = content.match(jsonObjectRegex);

        if (matches) {
            for (const match of matches) {
                const result = this.tryParseJSON(match);
                if (result) {
                    return result;
                }
            }
        }

        const taskRegex = /"id":\s*"([^"]+)",?\s*"query":\s*"([^"]+)"/g;
        const tasks: SubTask[] = [];
        let match;

        while ((match = taskRegex.exec(content)) !== null) {
            const [, id, query] = match;

            tasks.push({
                id,
                query,
                status: "pending" as const,
            });
        }

        return tasks.length > 0 ? { plan: tasks } : null;
    }

    static parseStrategySelection(content: string): ReasoningStrategy {
        try {
            const parsed = JSON.parse(content);
            const strategyName = parsed.strategy;

            if (
                [
                    "chain_of_thought",
                    "skeleton_of_thought",
                    "constrained_chain_of_thought",
                    "graph_of_thoughts",
                ].includes(strategyName)
            ) {
                return {
                    name: strategyName as ReasoningStrategy["name"],
                    parameters: { reasoning: parsed.reasoning },
                };
            }
        } catch (error) {
            console.error("failed to parse strategy selection:", error);
        }

        return { name: "chain_of_thought", parameters: {} };
    }

    private static extractCleanQuery(queryContent: string): string {
        if (!queryContent || typeof queryContent !== "string") {
            return "Invalid query content";
        }

        let clean = queryContent.replace(
            /```(?:json)?\s*([\s\S]*?)\s*```/g,
            "$1"
        );

        if (clean.trim().startsWith("{") && clean.trim().endsWith("}")) {
            try {
                const parsed = JSON.parse(clean);
                if (
                    parsed.plan &&
                    Array.isArray(parsed.plan) &&
                    parsed.plan.length > 0
                ) {
                    return parsed.plan?.at(0)?.query ?? clean.trim();
                }
            } catch (error) {
                console.error("failed to parse query JSON:", error);
            }
        }

        return clean.trim();
    }
}
