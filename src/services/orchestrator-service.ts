import { LMStudioClient } from "./lm-studio-client";
import { RAGService } from "./rag-service";
import { QueryClassifier } from "./query-classifier";
import {
    SubTask,
    ReasoningStrategy,
    ChatEvent,
    QueryClassification,
} from "../types";
import { EventEmitter } from "events";
import { PromptBuilder, ResponseParser, StrategyFactory } from "../reasoning";
import { AnswerBeautifier } from "../quality";

export class OrchestratorService extends EventEmitter {
    private readonly llmClient: LMStudioClient;
    private readonly ragService: RAGService;
    private readonly queryClassifier: QueryClassifier;
    private readonly strategyFactory: StrategyFactory;
    private readonly answerBeautifier: AnswerBeautifier;
    private readonly confidenceThreshold: number = 0.6;
    private readonly retryConfidenceThreshold: number = 0.8;

    constructor(llmClient: LMStudioClient, ragService: RAGService) {
        super();
        this.llmClient = llmClient;
        this.ragService = ragService;
        this.queryClassifier = new QueryClassifier(llmClient);
        this.strategyFactory = new StrategyFactory(llmClient);
        this.answerBeautifier = new AnswerBeautifier(llmClient);
    }

    async processQuery(
        chatId: string,
        query: string
    ): Promise<{ response: string }> {
        console.log(
            `[ORCHESTRATOR] Starting query processing for chatId: ${chatId}`
        );
        console.log(`[ORCHESTRATOR] Query: ${query}`);

        this.emitEvent(chatId, "thinking", { stage: "classification", query });
        console.log(`[ORCHESTRATOR] Stage 0: Classifying and refining query`);

        const classification =
            await this.queryClassifier.classifyAndRefineQuery(query, chatId);
        console.log(
            `[ORCHESTRATOR] Query classified - Intent: ${classification.intent}, Complexity: ${classification.complexity}`
        );

        this.emitEvent(chatId, "classification", {
            classification,
            originalQuery: query,
        });

        await this.ragService.addContext(
            chatId,
            `Query classification: ${JSON.stringify(classification)}`,
            {
                name: "query_result",
                confidence: classification.confidence,
                originalQuery: query,
                classification,
            }
        );

        let queryToProcess = query;

        if (
            classification.refinedQuery &&
            classification.refinedQuery !== query &&
            classification.refinedQuery.trim().length > 3
        ) {
            queryToProcess = classification.refinedQuery;
            console.log(
                `[ORCHESTRATOR] Using refined query: "${queryToProcess}"`
            );
        } else {
            console.log(
                `[ORCHESTRATOR] Using original query: "${queryToProcess}"`
            );
        }

        this.emitEvent(chatId, "thinking", {
            stage: "decomposition",
            query: queryToProcess,
        });

        console.log(`[ORCHESTRATOR] Stage 1: Decomposing refined query`);
        const decomposition = await this.decomposeQuery(
            queryToProcess,
            chatId,
            classification
        );
        console.log(
            `✅ [ORCHESTRATOR] Query decomposed into ${decomposition.subTasks.length} subtasks`
        );
        await this.ragService.addContext(
            chatId,
            `Query decomposition: ${JSON.stringify(decomposition)}`,
            {
                name: "decomposition",
                temperature: 0.8,
                originalQuery: query,
            }
        );

        const subTasks = decomposition.subTasks;
        const results: string[] = [];

        for (const subTask of subTasks) {
            console.log(
                `🎯 [ORCHESTRATOR] Stage 2: Processing subtask ${subTask.id}: ${subTask.query}`
            );
            this.emitEvent(chatId, "thinking", {
                stage: "strategy_selection",
                subTask: subTask.id,
            });

            const selectedStrategy = await this.selectReasoningStrategy(
                subTask.query,
                0.7,
                chatId
            );
            subTask.strategy = selectedStrategy;
            console.log(
                `🧠 [ORCHESTRATOR] Selected strategy: ${selectedStrategy.name} for subtask ${subTask.id}`
            );

            this.emitEvent(chatId, "thinking", {
                stage: "strategy_selected",
                subTask: subTask.id,
                strategy: selectedStrategy.name,
            });
            this.emitEvent(chatId, "subtask_start", { subTask });

            const result = await this.executeSubTask(
                chatId,
                subTask,
                selectedStrategy
            );
            results.push(result);
            console.log(`✅ [ORCHESTRATOR] Subtask ${subTask.id} completed`);

            this.emitEvent(chatId, "subtask_complete", {
                subTask: subTask.id,
                result,
            });
        }

        console.log(
            `📝 [ORCHESTRATOR] Stage 3: Synthesizing final answer from ${results.length} subtask results`
        );
        this.emitEvent(chatId, "final_answer", {
            stage: "summarize",
            results,
            query,
        });
        const finalAnswer = await this.synthesizeAndBeautifyAnswer(
            chatId,
            query,
            results
        );

        await this.ragService.clearContext(chatId);
        this.emitEvent(chatId, "final_answer", { answer: finalAnswer });
        console.log(
            `🎉 [ORCHESTRATOR] Query processing completed successfully`
        );

        return { response: finalAnswer };
    }

    private async selectReasoningStrategy(
        query: string,
        temperature: number,
        chatId?: string
    ): Promise<ReasoningStrategy> {
        console.log(`🤔 [ORCHESTRATOR] Selecting reasoning strategy for query`);
        const prompt = PromptBuilder.buildStrategySelection(query);
        const response = await this.llmClient.queryLLM(
            prompt,
            temperature,
            chatId,
            "strategy_selection"
        );

        return ResponseParser.parseStrategySelection(response.content);
    }

    private async decomposeQuery(
        query: string,
        chatId?: string,
        classification?: QueryClassification
    ): Promise<{ subTasks: SubTask[] }> {
        console.log(`[ORCHESTRATOR] Decomposing query into subtasks`);

        const prompt = this.buildEnhancedDecompositionPrompt(
            query,
            classification
        );
        const response = await this.llmClient.queryLLM(
            prompt,
            0.7,
            chatId,
            "decomposition"
        );

        return ResponseParser.parseDecomposition(response.content);
    }

    private buildEnhancedDecompositionPrompt(
        query: string,
        classification?: QueryClassification
    ): string {
        let prompt = PromptBuilder.buildDecomposition(query);

        if (!classification) {
            return prompt;
        }

        prompt += `\n\nAdditional Context:
- Query Intent: ${classification.intent}
- Query Complexity: ${classification.complexity}`;

        if (classification.suggestedSubQuestions.length > 0) {
            prompt += `\n- Suggested Sub-Questions:
${classification.suggestedSubQuestions.map((q) => `  • ${q}`).join("\n")}

Consider incorporating these suggested sub-questions into your decomposition.`;
        }

        return prompt;
    }

    private async executeSubTask(
        chatId: string,
        subTask: SubTask,
        strategy: ReasoningStrategy
    ): Promise<string> {
        console.log(
            `[ORCHESTRATOR] Executing subtask ${subTask.id} with strategy ${strategy.name}`
        );

        if (!subTask.query || subTask.query.trim().length < 3) {
            console.error(
                `[ORCHESTRATOR] Invalid subtask query: "${subTask.query}"`
            );
            throw new Error(
                `Subtask ${subTask.id} has invalid query: "${subTask.query}"`
            );
        }

        console.log(`[ORCHESTRATOR] Subtask query: "${subTask.query}"`);

        const context = await this.ragService.getRelevantContext(
            chatId,
            subTask.query
        );
        console.log(
            `📚 [ORCHESTRATOR] Retrieved ${context.length} context items for subtask ${subTask.id}`
        );
        const contextSummary = context.map((c) => c.content).join("\n\n");

        const executor = this.strategyFactory.getStrategy(strategy);
        console.log(
            `🎯 [ORCHESTRATOR] Executing ${strategy.name} strategy for subtask ${subTask.id}`
        );
        const { result, confidence } = await executor.execute(
            subTask.query,
            contextSummary,
            chatId
        );
        console.log(
            `📊 [ORCHESTRATOR] Subtask ${subTask.id} completed with confidence: ${confidence}`
        );

        subTask.result = result;
        subTask.confidence = confidence;
        subTask.status = "completed";

        await this.ragService.addContext(chatId, `Subtask result: ${result}`, {
            name: "subtask_result",
            confidence,
            subTaskId: subTask.id,
        });

        if (confidence < this.retryConfidenceThreshold) {
            return await this.retrySubTaskOneMoreTime({
                chatId,
                subTask,
                result,
                confidence,
                contextSummary,
            });
        }

        if (confidence < this.confidenceThreshold) {
            console.log(
                `⚠️ [ORCHESTRATOR] Low confidence (${confidence}) for subtask ${subTask.id}`
            );
            this.emitEvent(chatId, "validation", {
                subTask: subTask.id,
                confidence,
            });
            await this.ragService.addContext(
                chatId,
                `Low confidence response: ${result}`,
                {
                    name: "subtask_result",
                    confidence,
                    lowConfidence: true,
                    subTaskId: subTask.id,
                }
            );
        }

        return result;
    }

    private async retrySubTaskOneMoreTime(options: {
        chatId: string;
        subTask: SubTask;
        result: string;
        confidence: number;
        contextSummary: string;
        attempt?: number;
    }): Promise<string> {
        const attempt = options.attempt ?? 1;
        const maxAttempts = 3;

        const retryResult = await this.retrySubTask(
            options.chatId,
            options.subTask,
            options.result,
            options.confidence,
            options.contextSummary
        );

        if (
            !retryResult ||
            retryResult.confidence < this.retryConfidenceThreshold
        ) {
            console.log(
                `❌ [ORCHESTRATOR] Retry failed for subtask ${options.subTask.id}, keeping original result`
            );

            if (attempt >= maxAttempts) {
                console.warn(
                    `⚠️ [ORCHESTRATOR] Maximum retry attempts reached for subtask ${options.subTask.id}`
                );
                return retryResult?.result ?? "";
            }

            return this.retrySubTaskOneMoreTime({
                ...options,
                attempt: attempt + 1,
            });
        }

        console.log(
            `✅ [ORCHESTRATOR] Retry successful for subtask ${options.subTask.id}, new confidence: ${retryResult.confidence}`
        );
        options.subTask.result = retryResult.result;
        options.subTask.confidence = retryResult.confidence;

        await this.ragService.addContext(
            options.chatId,
            `Retry result: ${retryResult.result}`,
            {
                name: "subtask_result",
                confidence: retryResult.confidence,
                retry: true,
                subTaskId: options.subTask.id,
                originalConfidence: options.confidence,
            }
        );

        return retryResult.result;
    }

    private async synthesizeAndBeautifyAnswer(
        chatId: string,
        originalQuery: string,
        subTaskResults: string[]
    ): Promise<string> {
        console.log(`🔄 [ORCHESTRATOR] Stage 3a: Synthesizing raw answer`);
        this.emitEvent(chatId, "thinking", { stage: "synthesis" });
        const rawAnswer = await this.synthesizeFinalAnswer(
            chatId,
            originalQuery,
            subTaskResults
        );

        console.log(`✨ [ORCHESTRATOR] Stage 3b: Beautifying answer`);
        this.emitEvent(chatId, "thinking", { stage: "beautifying" });
        const beautifiedAnswer = await this.answerBeautifier.beautifyAnswer(
            originalQuery,
            rawAnswer,
            chatId
        );
        console.log(`🎨 [ORCHESTRATOR] Answer beautification completed`);

        return beautifiedAnswer;
    }

    private async synthesizeFinalAnswer(
        chatId: string,
        originalQuery: string,
        subTaskResults: string[]
    ): Promise<string> {
        console.log(
            `🔗 [ORCHESTRATOR] Retrieving relevant context for final synthesis`
        );
        const relevantContext = await this.ragService.getRelevantContext(
            chatId,
            originalQuery,
            2
        );
        console.log(
            `📖 [ORCHESTRATOR] Retrieved ${relevantContext.length} context items for final synthesis`
        );
        const compactContext = relevantContext
            .map((c) => c.content)
            .join(" | ");

        const prompt = PromptBuilder.buildFinalSynthesis(
            originalQuery,
            subTaskResults,
            compactContext
        );
        const response = await this.llmClient.queryLLM(
            prompt,
            0.2,
            chatId,
            "final_synthesis"
        );

        return ResponseParser.filterThinkBlocks(response.content);
    }

    private async retrySubTask(
        chatId: string,
        subTask: SubTask,
        previousResult: string,
        previousConfidence: number,
        originalContext: string
    ): Promise<{ result: string; confidence: number } | null> {
        try {
            console.log(
                `🔄 [ORCHESTRATOR] Creating retry prompt for subtask ${subTask.id}`
            );

            const additionalContext = await this.ragService.getRelevantContext(
                chatId,
                subTask.query,
                10
            );
            const enhancedContext = additionalContext
                .map((c) => c.content)
                .join("\n\n");

            console.log(
                `📚 [ORCHESTRATOR] Retrieved ${additionalContext.length} additional context items for retry`
            );

            const retryPrompt = PromptBuilder.buildRetryPrompt(
                subTask.query,
                previousResult,
                `${originalContext}\n\n${enhancedContext}`,
                previousConfidence
            );

            console.log(
                `🎯 [ORCHESTRATOR] Executing retry attempt for subtask ${subTask.id}`
            );

            const retryResponse = await this.llmClient.queryLLM(
                retryPrompt,
                0.1,
                chatId,
                "retry"
            );

            const retryResult = {
                result: ResponseParser.filterThinkBlocks(retryResponse.content),
                confidence: retryResponse.confidence ?? 0.5,
            };

            console.log(
                `📈 [ORCHESTRATOR] Retry completed - Original confidence: ${previousConfidence}, New confidence: ${retryResult.confidence}`
            );

            return retryResult;
        } catch (error) {
            console.error(
                `❌ [ORCHESTRATOR] Retry failed for subtask ${subTask.id}:`,
                error
            );
            return null;
        }
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
