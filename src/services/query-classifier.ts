import { LMStudioClient } from "./lm-studio-client";
import { QueryClassification } from "../types";

export class QueryClassifier {
    private readonly llmClient: LMStudioClient;

    constructor(llmClient: LMStudioClient) {
        this.llmClient = llmClient;
    }

    async classifyAndRefineQuery(
        query: string,
        chatId?: string
    ): Promise<QueryClassification> {
        console.log(
            `[CLASSIFIER] Classifying and refining query: ${query.substring(
                0,
                100
            )}...`
        );

        try {
            const prompt = this.buildClassificationPrompt(query);
            const response = await this.llmClient.queryLLM(
                prompt,
                0.1,
                chatId,
                "query_classification"
            );

            console.log(`[CLASSIFIER] Raw LLM response: ${response.content}`);

            const classification = this.parseClassificationResponse(
                response.content,
                query
            );

            console.log(
                `[CLASSIFIER] Query classified - Intent: ${classification.intent}, Complexity: ${classification.complexity}, Refined: "${classification.refinedQuery}"`
            );
            return classification;
        } catch (error) {
            console.error("[CLASSIFIER] Failed to classify query:", error);
            return {
                refinedQuery: query,
                intent: "other",
                complexity: "simple",
                suggestedSubQuestions: [],
                originalQuery: query,
                confidence: 0.5,
            };
        }
    }

    private buildClassificationPrompt(query: string): string {
        return `You are an expert query classifier for a RAG system. Your task is to analyze and classify user queries with precision.

**CRITICAL: You MUST respond with EXACTLY this JSON structure:**

{
  "refinedQuery": "[Improved version preserving original intent]",
  "intent": "[fact|comparison|reasoning|clarification|instruction|other]",
  "complexity": "[simple|complex]",
  "suggestedSubQuestions": ["question1", "question2"],
  "confidence": 0.95
}

**Classification Guidelines:**

**Intent Types:**
- **fact**: Direct information requests ("What is X?", "Define Y")
- **comparison**: Comparing entities/concepts ("Difference between X and Y")
- **reasoning**: Analysis, explanation, or logical deduction ("Why does X happen?", "How does Y work?")
- **clarification**: Seeking clarification on ambiguous topics
- **instruction**: Step-by-step guidance or tutorials ("How to do X")
- **other**: Queries that don't fit above categories

**Complexity Classification:**
- **simple**: Single-step, direct queries with clear scope
- **complex**: Multi-step queries requiring decomposition, analysis, or multiple information sources

**Query Refinement Rules:**
1. Preserve original intent completely
2. Remove ambiguity and add specificity
3. Ensure completeness for retrieval
4. Use precise terminology
5. Keep natural language flow

**Sub-Questions (Complex queries only):**
- Break down into logical components
- Each sub-question should be independently answerable
- Maximum 4 sub-questions for focus
- Empty array for simple queries

**Examples:**

Input: "What are the main differences between GPT-3 and GPT-4?"
Output:
{
  "refinedQuery": "Compare the key architectural, performance, and capability differences between GPT-3 and GPT-4 language models",
  "intent": "comparison",
  "complexity": "complex",
  "suggestedSubQuestions": [
    "What are the architectural differences between GPT-3 and GPT-4?",
    "How does performance differ between GPT-3 and GPT-4 on benchmarks?",
    "What new capabilities does GPT-4 have over GPT-3?"
  ],
  "confidence": 0.95
}

Input: "Define linked list"
Output:
{
  "refinedQuery": "What is a linked list data structure in computer science and how does it work?",
  "intent": "fact",
  "complexity": "simple",
  "suggestedSubQuestions": [],
  "confidence": 0.98
}

Now classify this query:
${query}

Respond with ONLY the JSON object, no additional text.`;
    }

    private parseClassificationResponse(
        content: string,
        originalQuery: string
    ): QueryClassification {
        try {
            console.log(
                `[CLASSIFIER] Parsing LLM response: ${content.substring(
                    0,
                    200
                )}...`
            );

            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    const parsed = JSON.parse(jsonMatch[0]);

                    if (
                        parsed.refinedQuery &&
                        parsed.intent &&
                        parsed.complexity
                    ) {
                        return {
                            refinedQuery: this.validateRefinedQuery(
                                parsed.refinedQuery,
                                originalQuery
                            ),
                            intent: this.normalizeIntent(parsed.intent),
                            complexity:
                                parsed.complexity === "complex"
                                    ? "complex"
                                    : "simple",
                            suggestedSubQuestions: Array.isArray(
                                parsed.suggestedSubQuestions
                            )
                                ? parsed.suggestedSubQuestions.filter(
                                      (q: unknown) =>
                                          typeof q === "string" &&
                                          q.trim().length > 0
                                  )
                                : [],
                            originalQuery,
                            confidence:
                                typeof parsed.confidence === "number"
                                    ? parsed.confidence
                                    : 0.9,
                        };
                    }
                } catch (jsonError) {
                    console.warn(
                        `[CLASSIFIER] Invalid JSON in response: ${jsonError}`
                    );
                }
            }

            return this.parseWithRegex(content, originalQuery);
        } catch (error) {
            console.error(
                "[CLASSIFIER] Failed to parse classification response:",
                error
            );
            return this.getDefaultClassification(originalQuery);
        }
    }

    private validateRefinedQuery(
        refinedQuery: string,
        originalQuery: string
    ): string {
        if (
            !refinedQuery ||
            refinedQuery.length < 3 ||
            /^[^\w\s]*$/.test(refinedQuery) ||
            refinedQuery.toLowerCase().includes("[") ||
            refinedQuery.toLowerCase().includes("improved version")
        ) {
            console.warn(
                `[CLASSIFIER] Invalid refined query "${refinedQuery}", using original`
            );
            return originalQuery;
        }
        return refinedQuery.trim();
    }

    private parseWithRegex(
        content: string,
        originalQuery: string
    ): QueryClassification {
        const refinedQueryMatch = content.match(
            /Refined Query:\s*["']?([^"\n]+?)["']?\s*(?:\n|$)/i
        );
        let refinedQuery = refinedQueryMatch
            ? refinedQueryMatch[1].trim()
            : originalQuery;

        refinedQuery = this.validateRefinedQuery(refinedQuery, originalQuery);

        const intentMatch = content.match(/Intent:\s*(\w+)/i);
        const intentStr = intentMatch ? intentMatch[1].toLowerCase() : "other";
        const intent = this.normalizeIntent(intentStr);

        const complexityMatch = content.match(/Complexity:\s*(\w+)/i);
        const complexityStr = complexityMatch
            ? complexityMatch[1].toLowerCase()
            : "simple";
        const complexity = complexityStr === "complex" ? "complex" : "simple";

        const suggestedSubQuestions = this.extractSubQuestions(content);

        return {
            refinedQuery,
            intent,
            complexity,
            suggestedSubQuestions,
            originalQuery,
            confidence: 0.8,
        };
    }

    private getDefaultClassification(
        originalQuery: string
    ): QueryClassification {
        return {
            refinedQuery: originalQuery,
            intent: "other",
            complexity: "simple",
            suggestedSubQuestions: [],
            originalQuery,
            confidence: 0.5,
        };
    }

    private normalizeIntent(intentStr: string): QueryClassification["intent"] {
        switch (intentStr) {
            case "fact":
            case "factual":
                return "fact";
            case "comparison":
            case "compare":
                return "comparison";
            case "reasoning":
            case "reason":
            case "analysis":
            case "analyze":
                return "reasoning";
            case "clarification":
            case "clarify":
                return "clarification";
            case "instruction":
            case "instructions":
            case "how":
            case "tutorial":
                return "instruction";
            default:
                return "other";
        }
    }

    private extractSubQuestions(content: string): string[] {
        const subQuestions: string[] = [];

        const subQuestionsMatch = content.match(
            /Suggested Sub-Questions[:\s]*(.+?)(?:\n\n|$)/is
        );

        if (subQuestionsMatch) {
            const subQuestionsText = subQuestionsMatch[1];

            if (
                subQuestionsText.includes("[]") ||
                subQuestionsText.trim() === ""
            ) {
                return [];
            }

            const lines = subQuestionsText.split("\n");
            for (const line of lines) {
                const trimmed = line.trim();
                if (
                    trimmed &&
                    (trimmed.startsWith("-") ||
                        trimmed.startsWith("•") ||
                        /^\d+\./.test(trimmed))
                ) {
                    const question = trimmed
                        .replace(/^[-•]\s*/, "")
                        .replace(/^\d+\.\s*/, "")
                        .replace(/^["']|["']$/g, "")
                        .trim();
                    if (question) {
                        subQuestions.push(question);
                    }
                }
            }
        }

        return subQuestions;
    }

    async evaluateClassificationQuality(
        classification: QueryClassification
    ): Promise<{
        quality: "high" | "medium" | "low";
        suggestions: string[];
    }> {
        const suggestions: string[] = [];
        let quality: "high" | "medium" | "low" = "high";

        if (classification.refinedQuery === classification.originalQuery) {
            suggestions.push("Consider refining the query for better clarity");
            quality = "medium";
        }

        if (
            classification.complexity === "complex" &&
            classification.suggestedSubQuestions.length === 0
        ) {
            suggestions.push(
                "Complex queries should include suggested sub-questions for decomposition"
            );
            quality = "medium";
        }

        if (classification.confidence < 0.7) {
            suggestions.push(
                "Low confidence classification - consider manual review"
            );
            quality = "low";
        }

        return { quality, suggestions };
    }
}
