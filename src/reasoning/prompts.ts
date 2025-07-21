export class PromptBuilder {
    private static readonly MAX_CONTEXT_TOKENS = 4096;
    private static readonly CHARS_PER_TOKEN = 4;

    private static truncateText(text: string, maxChars: number): string {
        if (text.length <= maxChars) return text;
        return text.substring(0, maxChars - 3) + "...";
    }

    private static optimizeContext(context: string): string {
        const maxChars = this.MAX_CONTEXT_TOKENS * this.CHARS_PER_TOKEN;
        return this.truncateText(context, maxChars);
    }

    private static optimizeSubTaskResults(results: string[]): string[] {
        const maxCharsPerResult = Math.floor(
            (this.MAX_CONTEXT_TOKENS * this.CHARS_PER_TOKEN) / results.length
        );
        return results.map((result) =>
            this.truncateText(result, maxCharsPerResult)
        );
    }

    static buildDecomposition(query: string): string {
        return `Analyze and decompose this query ONLY if it contains multiple distinct information needs that require separate research.

Query: "${query}"

STEP 1 - Complexity Assessment:
First determine: Does this query actually need decomposition?
- Simple, single-intent queries should NOT be decomposed
- Only decompose if the query contains 2+ distinct, separable information needs
- If query is already focused and specific, return it as-is

STEP 2 - Relevance-Filtered Decomposition:
If decomposition is needed, create subtasks that:
- Directly address the original query's core intent
- Can be answered independently with factual information  
- Are essential to answering the main question
- Avoid tangential or overly broad questions

STEP 3 - Context Preservation:
Each subtask must:
- Maintain the original query's domain/scope
- Preserve key entities and specific contexts mentioned
- Focus on actionable, researchable questions

Respond with JSON only:
{
  "needsDecomposition": true/false,
  "reasoning": "Brief explanation of why decomposition is/isn't needed",
  "subTasks": [
    {
      "id": "1",
      "query": "First essential question that directly supports the main query",
      "status": "pending",
      "relevanceScore": 0.9
    }
  ]
}

Requirements:
- Maximum 3-4 subtasks (prefer fewer when possible)
- Each subtask must have relevanceScore ≥ 0.8 to original query
- Eliminate questions about definitions, background, or tangential topics
- Focus on core factual needs that enable answering the original question`;
    }

    static buildStrategySelection(query: string): string {
        return `Select the best reasoning strategy for this question: "${query}"

Strategies:
1. chain_of_thought - Simple factual questions
2. skeleton_of_thought - Multi-part questions
3. constrained_chain_of_thought - Critical accuracy needed
4. graph_of_thoughts - Complex interconnected facts

Respond with JSON:
{
  "strategy": "chain_of_thought",
  "reasoning": "Brief explanation"
}`;
    }

    static buildFactualAnswer(query: string, context: string): string {
        return `Answer this question with accurate, factual information.

Question: "${query}"
${context ? `Context: ${context}` : ""}

Provide a clear, complete answer. If uncertain about any facts, acknowledge the uncertainty.`;
    }

    static buildFinalSynthesis(
        originalQuery: string,
        subTaskResults: string[],
        compactContext: string
    ): string {
        const optimizedContext = this.optimizeContext(compactContext);
        const optimizedResults = this.optimizeSubTaskResults(subTaskResults);

        return `Answer this question using the information gathered from multiple sources.

Question: "${originalQuery}"

${optimizedContext ? `Context: ${optimizedContext}` : ""}

Information sources:
${optimizedResults.map((result, i) => `${i + 1}. ${result}`).join("\n")}

Provide a complete, accurate answer that addresses all parts of the question. Use the information from the sources above and acknowledge any gaps in the available information.`;
    }

    static buildRetryPrompt(
        originalQuery: string,
        previousResult: string,
        context: string,
        confidence: number
    ): string {
        const optimizedContext = this.optimizeContext(context);
        const optimizedPreviousResult = this.truncateText(previousResult, 1000);

        return `The previous attempt to answer this question had low confidence (${confidence.toFixed(
            2
        )}). Please provide a more comprehensive and accurate answer.

Question: "${originalQuery}"

Previous attempt: ${optimizedPreviousResult}

${optimizedContext ? `Additional context: ${optimizedContext}` : ""}

Instructions:
- Identify what might have caused the low confidence in the previous attempt
- Provide a more detailed and accurate answer
- Use specific facts and evidence when possible
- If you're still uncertain about any aspect, clearly state what information is missing
- Aim for higher confidence by being more thorough and precise

Provide your improved answer:`;
    }
}
