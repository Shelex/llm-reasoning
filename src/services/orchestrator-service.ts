import { LMStudioClient } from "./lm-studio-client";
import { RAGService } from "./rag-service";
import { SubTask, ReasoningStrategy, ChatEvent } from "../types";
import { EventEmitter } from "events";
import { PromptBuilder, ResponseParser, StrategyFactory } from "../reasoning";
import { AnswerBeautifier } from "../quality";

export class OrchestratorService extends EventEmitter {
    private llmClient: LMStudioClient;
    private ragService: RAGService;
    private strategyFactory: StrategyFactory;
    private answerBeautifier: AnswerBeautifier;
    private readonly confidenceThreshold: number = 0.6;
    private readonly retryConfidenceThreshold: number = 0.8;

    constructor(llmClient: LMStudioClient, ragService: RAGService) {
        super();
        this.llmClient = llmClient;
        this.ragService = ragService;
        this.strategyFactory = new StrategyFactory(llmClient);
        this.answerBeautifier = new AnswerBeautifier(llmClient);
    }

    async processQuery(
        chatId: string,
        query: string
    ): Promise<{ response: string; selectedStrategy: ReasoningStrategy }> {
        console.log(
            `🚀 [ORCHESTRATOR] Starting query processing for chatId: ${chatId}`
        );
        console.log(`📋 [ORCHESTRATOR] Query: ${query}`);

        this.emitEvent(chatId, "thinking", { stage: "decomposition", query });

        console.log(`🔍 [ORCHESTRATOR] Stage 1: Decomposing query`);
        const decomposition = await this.decomposeQuery(query);
        console.log(
            `✅ [ORCHESTRATOR] Query decomposed into ${decomposition.subTasks.length} subtasks`
        );
        await this.ragService.addContext(
            chatId,
            `Query decomposition: ${JSON.stringify(decomposition)}`,
            {
                type: "decomposition",
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
                0.7
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

        await this.ragService.addContext(
            chatId,
            `Final answer: ${finalAnswer}`,
            {
                type: "final_answer",
                originalQuery: query,
            }
        );

        this.emitEvent(chatId, "final_answer", { answer: finalAnswer });
        console.log(
            `🎉 [ORCHESTRATOR] Query processing completed successfully`
        );

        const primaryStrategy = subTasks[0]?.strategy ?? {
            name: "chain_of_thought",
            parameters: {},
        };
        return { response: finalAnswer, selectedStrategy: primaryStrategy };
    }

    private async selectReasoningStrategy(
        query: string,
        temperature: number
    ): Promise<ReasoningStrategy> {
        console.log(`🤔 [ORCHESTRATOR] Selecting reasoning strategy for query`);
        const prompt = PromptBuilder.buildStrategySelection(query);
        const response = await this.llmClient.queryLLM(prompt, temperature);

        return ResponseParser.parseStrategySelection(response.content);
    }

    private async decomposeQuery(
        query: string
    ): Promise<{ subTasks: SubTask[] }> {
        console.log(`🔨 [ORCHESTRATOR] Decomposing query into subtasks`);
        const prompt = PromptBuilder.buildDecomposition(query);
        const response = await this.llmClient.queryLLM(prompt, 0.7);

        return ResponseParser.parseDecomposition(response.content);
    }

    private async executeSubTask(
        chatId: string,
        subTask: SubTask,
        strategy: ReasoningStrategy
    ): Promise<string> {
        console.log(
            `⚡ [ORCHESTRATOR] Executing subtask ${subTask.id} with strategy ${strategy.name}`
        );
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
            0.2
        );
        console.log(
            `📊 [ORCHESTRATOR] Subtask ${subTask.id} completed with confidence: ${confidence}`
        );

        subTask.result = result;
        subTask.confidence = confidence;
        subTask.status = "completed";

        await this.ragService.addContext(chatId, `Subtask result: ${result}`, {
            type: "subtask_result",
            subTaskId: subTask.id,
            confidence: confidence,
        });

        // Check if confidence is below retry threshold
        if (confidence < this.retryConfidenceThreshold) {
            console.log(
                `🔄 [ORCHESTRATOR] Confidence ${confidence} below threshold ${this.retryConfidenceThreshold} for subtask ${subTask.id}, attempting retry`
            );
            const retryResult = await this.retrySubTask(
                chatId,
                subTask,
                result,
                confidence,
                contextSummary
            );
            if (retryResult) {
                console.log(
                    `✅ [ORCHESTRATOR] Retry successful for subtask ${subTask.id}, new confidence: ${retryResult.confidence}`
                );
                subTask.result = retryResult.result;
                subTask.confidence = retryResult.confidence;

                await this.ragService.addContext(
                    chatId,
                    `Retry result: ${retryResult.result}`,
                    {
                        type: "retry_result",
                        subTaskId: subTask.id,
                        confidence: retryResult.confidence,
                        originalConfidence: confidence,
                    }
                );

                return retryResult.result;
            }
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
                    type: "low_confidence",
                    subTaskId: subTask.id,
                    confidence: confidence,
                }
            );
        }

        return result;
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
            rawAnswer
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
        const response = await this.llmClient.queryLLM(prompt, 0.2);

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
                0.1
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
