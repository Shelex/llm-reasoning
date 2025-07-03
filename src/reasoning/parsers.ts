import { SubTask, ReasoningStrategy } from "../types";
import { ResponseFilter } from "../utils/response-filter";

export class ResponseParser {
    static filterThinkBlocks(content: string): string {
        return ResponseFilter.filterThinkBlocks(content);
    }

    static parseDecomposition(content: string): { subTasks: SubTask[] } {
        const jsonResult = this.tryParseJSON(content);
        if (jsonResult) {
            return jsonResult;
        }

        const markdownResult = this.tryParseMarkdownJSON(content);
        if (markdownResult) {
            return markdownResult;
        }

        return {
            subTasks: [
                {
                    id: "1",
                    query: content.trim(),
                    status: "pending" as const,
                },
            ],
        };
    }

    private static tryParseJSON(
        content: string
    ): { subTasks: SubTask[] } | null {
        try {
            const parsed = JSON.parse(content);
            if (!parsed.subTasks || !Array.isArray(parsed.subTasks)) {
                return null;
            }

            return {
                subTasks: parsed.subTasks.map((task: any, index: number) => ({
                    id: task.id ?? String(index + 1),
                    query: this.extractCleanQuery(task.query),
                    status: "pending" as const,
                })),
            };
        } catch {}
        return null;
    }

    private static tryParseMarkdownJSON(
        content: string
    ): { subTasks: SubTask[] } | null {
        const jsonRegex = new RegExp(
            "```(?:json)?\\s*(\\{[\\s\\S]*?\\})\\s*```"
        );
        const jsonMatch = jsonRegex.exec(content);
        if (jsonMatch) {
            return this.tryParseJSON(jsonMatch[1]);
        }
        return null;
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
        } catch {
            // Fallback parsing
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
                    parsed.subTasks &&
                    Array.isArray(parsed.subTasks) &&
                    parsed.subTasks.length > 0
                ) {
                    return parsed.subTasks[0].query ?? clean.trim();
                }
            } catch {}
        }

        return clean.trim();
    }
}
