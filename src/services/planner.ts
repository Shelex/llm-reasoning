import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { SubTask, ReasoningStrategy, ChatEvent } from "../types";
import { StrategyFactory, ResponseParser } from "../reasoning";
import { RAGService } from "./rag";
import { EventEmitter } from "events";
import { AnswerBeautifier } from "../quality";
import { LLMClient } from "./llm/client";

const decompositionSample = `
    {
     "plan": [
       { "id": "task_1", "query": "..." },
       { "id": "task_2", "query": "..." }
     ]
   }
`;

export interface GraphState {
    chatId: string;
    query: string;
    plan: SubTask[];
    currentSubTaskIndex: number;
    results: string[];
    finalAnswer: string;
    confidence: number;
    retryCount: number;
}

const GraphStateAnnotation = Annotation.Root({
    chatId: Annotation<string>,
    query: Annotation<string>,
    plan: Annotation<SubTask[]>({
        reducer: (x, y) => y ?? x,
    }),
    currentSubTaskIndex: Annotation<number>({
        reducer: (x, y) => y ?? x,
    }),
    results: Annotation<string[]>({
        reducer: (x, y) => (y ? [...(x || []), ...y] : x || []),
    }),
    finalAnswer: Annotation<string>({
        reducer: (x, y) => y ?? x,
    }),
    confidence: Annotation<number>({
        reducer: (x, y) => y ?? x,
    }),
    retryCount: Annotation<number>({
        reducer: (x, y) => y ?? x,
    }),
});

export class Planner extends EventEmitter {
    private readonly llmClient: LLMClient;
    private readonly ragService: RAGService;
    private readonly graph: any;
    private readonly beautifier: AnswerBeautifier;

    constructor(llmClient: LLMClient, ragService: RAGService) {
        super();
        this.llmClient = llmClient;
        this.ragService = ragService;
        this.graph = this.buildGraph();
        this.beautifier = new AnswerBeautifier(llmClient);
    }

    private buildGraph() {
        const graphBuilder = new StateGraph(GraphStateAnnotation)
            .addNode("planner", this.plannerNode.bind(this))
            .addNode("executor", this.executorNode.bind(this))
            .addNode("critic", this.criticNode.bind(this))
            .addNode("synthesizer", this.synthesizerNode.bind(this))
            .addEdge(START, "planner")
            .addEdge("planner", "executor")
            .addConditionalEdges("executor", this.shouldContinue.bind(this))
            .addConditionalEdges("critic", this.shouldRetry.bind(this))
            .addEdge("synthesizer", END);

        return graphBuilder.compile();
    }

    async processQuery(
        chatId: string,
        query: string
    ): Promise<{ response: string }> {
        const config = { configurable: { thread_id: chatId } };
        const initialState: Partial<GraphState> = {
            chatId,
            query,
            plan: [],
            currentSubTaskIndex: 0,
            results: [],
            finalAnswer: "",
            confidence: 0,
            retryCount: 0,
        };

        this.emitEvent(chatId, "thinking", { stage: "starting", query });

        const result = await this.graph.invoke(initialState, config);

        await this.ragService.clearContext(chatId);
        this.emitEvent(chatId, "final_answer", { answer: result.finalAnswer });

        return { response: result.finalAnswer };
    }

    private async plannerNode(state: any): Promise<any> {
        console.log(
            `[MAP PLANNER] Using Model-as-Planner for query: ${state.query}`
        );
        this.emitEvent(state.chatId, "thinking", {
            stage: "map_planning",
            query: state.query,
        });

        const plannerPrompt = this.buildMAPlannerPrompt(state.query);
        const planResponse = await this.llmClient.queryLLM(
            plannerPrompt,
            0.7,
            state.chatId,
            "map_planning"
        );

        const initialPlan = this.parseDecomposition(planResponse.content);

        this.emitEvent(state.chatId, "thinking", {
            stage: "map_refinement",
            query: state.query,
        });

        const refined = await this.refinePlan(
            state.query,
            initialPlan,
            state.chatId
        );

        console.log(
            `[MAP PLANNER] Generated ${refined.plan.length} refined planned subtasks`
        );

        await this.ragService.addContext(
            state.chatId,
            `Original query: ${state.query}`
        );
        await this.ragService.addContext(
            state.chatId,
            `Plan: ${JSON.stringify(refined.plan)}`
        );

        return {
            plan: refined.plan,
            currentSubTaskIndex: 0,
        };
    }

    private async refinePlan(
        originalQuery: string,
        initialPlan: { plan: SubTask[] },
        chatId: string
    ): Promise<{ plan: SubTask[] }> {
        const refinePrompt = `
You are a planning critic. Review this task decomposition and improve it.

Original Query: ${originalQuery}

Initial Plan:
${initialPlan.plan.map((t, i) => `${i + 1}. ${t.query}`).join("\n")}

Provide a refined plan that:
1. Ensures that output is a valid JSON object and matches the example format:
${decompositionSample}
2. Ensures logical ordering of subtasks
3. Removes redundant or unnecessary steps
4. Adds missing critical steps
5. Ensures each subtask is specific and actionable

Return the refined plan in the valid JSON format.
    `;

        const refineResponse = await this.llmClient.queryLLM(
            refinePrompt,
            0.3,
            chatId,
            "plan_refinement"
        );

        try {
            const refined = this.parseDecomposition(refineResponse.content);
            console.log(
                `[MAP PLANNER] Plan refined: ${initialPlan.plan.length} → ${refined.plan.length} planned subtasks`
            );
            return refined;
        } catch (error) {
            console.warn(
                `[MAP PLANNER] Plan refinement failed, using initial plan:`,
                error
            );
            return initialPlan;
        }
    }

    private async executorNode(state: any): Promise<any> {
        console.log(
            `[EXECUTOR] Starting execution for chatId: ${state.chatId} | currentSubTaskIndex - ${state.currentSubTaskIndex}`
        );
        const currentTask = state.plan[state.currentSubTaskIndex];
        if (!currentTask) {
            return { currentSubTaskIndex: state.currentSubTaskIndex + 1 };
        }

        console.log(
            `[EXECUTOR] Processing subtask ${currentTask.id}: ${currentTask.query}`
        );
        this.emitEvent(state.chatId, "subtask_start", { subTask: currentTask });

        const strategy = await this.selectReasoningStrategy(
            currentTask.query,
            state.chatId
        );
        currentTask.strategy = strategy;
        this.emitEvent(state.chatId, "subtask_strategy", {
            subTask: currentTask,
            strategy,
        });

        const context = await this.ragService.getRelevantContext(
            state.chatId,
            currentTask.query
        );
        const ragContextSummary = context.map((c) => c.content).join("\n\n");

        const previousResults = this.buildPreviousSubtasksContext(state);
        const fullContext = this.combineContexts(
            ragContextSummary,
            previousResults
        );

        console.log(
            `[EXECUTOR] Context for subtask ${
                currentTask.id
            }: Previous results: ${
                previousResults ? "Yes" : "No"
            }, RAG context: ${ragContextSummary ? "Yes" : "No"}`
        );

        this.emitEvent(state.chatId, "context_retrieve", {
            subTask: currentTask.id,
            hasPreviousResults: !!previousResults,
            hasRAGContext: !!ragContextSummary,
            contextLength: fullContext.length,
        });

        const result = await this.executeReasoningStrategy(
            currentTask.query,
            fullContext,
            strategy,
            state.chatId
        );

        currentTask.result = result.result;
        currentTask.confidence = result.confidence;
        currentTask.status = "completed";

        this.emitEvent(state.chatId, "subtask_complete", {
            subTask: currentTask.id,
            result: result.result,
        });

        await this.ragService.addContext(
            state.chatId,
            `Subtask ${currentTask.id} (${currentTask.query}): ${result.result}` +
                `\nStrategy used: ${strategy.name}` +
                `\nConfidence: ${result.confidence}`
        );

        return {
            results: [result.result],
            confidence: result.confidence,
            currentSubTaskIndex: state.currentSubTaskIndex + 1,
        };
    }

    private async criticNode(state: any): Promise<any> {
        const currentTask = state.plan[state.currentSubTaskIndex - 1];
        console.log(
            `[CRITIC] Reviewing subtask ${currentTask.id} with confidence ${state.confidence}`
        );

        this.emitEvent(state.chatId, "validation", {
            subTask: currentTask.id,
            confidence: state.confidence,
        });

        if (state.confidence < 0.6 && state.retryCount < 3) {
            console.log(`[CRITIC] Low confidence detected, preparing retry`);
            return { retryCount: state.retryCount + 1 };
        }

        return {};
    }

    private async synthesizerNode(state: any): Promise<any> {
        console.log(
            `[SYNTHESIZER] Creating final answer from ${state.results.length} results`
        );
        this.emitEvent(state.chatId, "thinking", { stage: "synthesis" });

        const finalAnswer = await this.beautifier.beautifyAnswer(
            state.query,
            state.results,
            state.chatId
        );

        return { finalAnswer };
    }

    private shouldContinue(state: any): string {
        if (state.currentSubTaskIndex >= state.plan.length) {
            return "synthesizer";
        }

        if (state.confidence < 0.8) {
            return "critic";
        }

        return "executor";
    }

    private shouldRetry(state: any): string {
        if (state.confidence < 0.6 && state.retryCount < 3) {
            return "executor";
        }
        return "synthesizer";
    }

    private async selectReasoningStrategy(
        query: string,
        chatId: string
    ): Promise<ReasoningStrategy> {
        const prompt = this.buildStrategySelectionPrompt(query);
        const response = await this.llmClient.queryLLM(
            prompt,
            0.7,
            chatId,
            "strategy_selection"
        );
        return this.parseStrategySelection(response.content);
    }

    private async executeReasoningStrategy(
        query: string,
        context: string,
        strategy: ReasoningStrategy,
        chatId: string
    ): Promise<{ result: string; confidence: number }> {
        const strategyFactory = new StrategyFactory(this.llmClient);
        const executor = strategyFactory.getStrategy(strategy);

        return await executor.execute(query, context, chatId);
    }

    private buildMAPlannerPrompt(query: string) {
        return `
You are a Model-as-Planner (MAP) agent. Break the user query into plan with atomic subtasks.

USER_QUERY:
${query}

--- OUTPUT RULES ---
1. JSON example:
   ${decompositionSample}
2. Respond with **valid JSON** only that matches JSON example.
4. Do not wrap the JSON in code fences.
5. Do not write explanations, comments, or additional keys.
6. Reply **ONLY** with the JSON object, no other text.
7. "plan" should be an array of subtasks.
8. Each subtask should have a unique "id" and a "query", no other fields allowed.

BEGIN STRUCTURED JSON BELOW:
`;
    }

    private buildStrategySelectionPrompt(query: string): string {
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

    private parseDecomposition(content: string): { plan: SubTask[] } {
        return ResponseParser.parseDecomposition(content);
    }

    private parseStrategySelection(content: string): ReasoningStrategy {
        return ResponseParser.parseStrategySelection(content);
    }

    private buildPreviousSubtasksContext(state: any): string {
        const completedSubtasks = state.plan
            .slice(0, state.currentSubTaskIndex)
            .filter(
                (subtask: SubTask) =>
                    subtask.status === "completed" && subtask.result
            );

        if (!completedSubtasks.length) {
            return "";
        }

        const previousResultsText = completedSubtasks
            .map((subtask: SubTask, index: number) => {
                const strategyInfo = subtask.strategy
                    ? ` [${subtask.strategy.name}]`
                    : "";
                const confidenceInfo = subtask.confidence
                    ? ` (confidence: ${subtask.confidence.toFixed(2)})`
                    : "";
                return `Previous Result ${index + 1} (${
                    subtask.id
                })${strategyInfo}${confidenceInfo}: ${subtask.query}\nAnswer: ${
                    subtask.result
                }`;
            })
            .join("\n\n");

        return `## Previous Subtask Results:\n${previousResultsText}`;
    }

    private combineContexts(
        ragContext: string,
        previousResults: string
    ): string {
        const contexts: string[] = [];

        if (previousResults) {
            contexts.push(previousResults);
        }

        if (ragContext) {
            contexts.push(`## Retrieved Context:\n${ragContext}`);
        }

        if (!contexts.length) {
            return "";
        }

        return `# Context Information\n\n${contexts.join("\n\n")}`;
    }

    private emitEvent(
        chatId: string,
        type: ChatEvent["type"],
        data: Record<string, unknown>
    ): void {
        const event: ChatEvent = {
            type,
            data,
            timestamp: new Date(),
        };

        this.emit("chat_event", chatId, event);
    }
}
