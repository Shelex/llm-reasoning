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
        return `Break down this query into specific subtasks that can be answered with factual information.

Query: "${query}"

Respond with JSON only:
{
  "subTasks": [
    {
      "id": "1",
      "query": "First specific question",
      "status": "pending"
    },
    {
      "id": "2",
      "query": "Second specific question", 
      "status": "pending"
    }
  ]
}

Requirements:
- Create 2-4 clear, specific questions
- Each question should seek factual information
- Avoid vague or speculative subtasks
- Focus on verifiable facts`;
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
