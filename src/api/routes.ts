import { Router, Request, Response } from "express";
import { ChatService } from "../services/chat-service";
import { OrchestratorService } from "../services/orchestrator-service";
import { LMStudioClient } from "../services/lm-studio-client";
import { QueryRequest } from "../types";

export function createRoutes(
    chatService: ChatService,
    orchestratorService: OrchestratorService,
    llmClient: LMStudioClient
): Router {
    const router = Router();

    router.post("/chat/create", async (req: Request, res: Response) => {
        try {
            const chatId = chatService.createChat();
            res.json({ chatId, status: "created" });
        } catch (error) {
            res.status(500).json({
                error: `Failed to create chat session: ${error}`,
            });
        }
    });

    router.post("/chat/:id/ask", async (req: Request, res: Response) => {
        try {
            const chatId = req.params.id;
            const { query, reason = true }: QueryRequest = req.body;

            if (!chatService.isChatExists(chatId)) {
                return res
                    .status(404)
                    .json({ error: "Chat session not found" });
            }

            if (!query || typeof query !== "string") {
                return res
                    .status(400)
                    .json({ error: "Query is required and must be a string" });
            }

            chatService.addMessage(chatId, "user", query);

            let response: string;
            let usedStrategy: string;

            if (reason) {
                const result = await orchestratorService.processQuery(
                    chatId,
                    query
                );
                response = result.response;
                usedStrategy = result.selectedStrategy.name;
            } else {
                console.log(`🏎️ [DIRECT] Starting direct query processing for chatId: ${chatId}`);
                console.log(`📝 [DIRECT] Query: ${query}`);
                console.log(`⚡ [DIRECT] Bypassing orchestrator - sending directly to LLM`);
                
                const llmResponse = await llmClient.queryLLM(query);
                response = llmResponse.content;
                usedStrategy = "direct";
                
                console.log(`✅ [DIRECT] Direct query completed successfully`);
                console.log(`📊 [DIRECT] Response confidence: ${llmResponse.confidence ?? 'N/A'}`);
            }

            chatService.addMessage(chatId, "assistant", response);

            res.json({
                chatId,
                response,
                reasoning: reason,
                strategy: usedStrategy,
                strategyReasoning: reason,
            });
        } catch (error) {
            console.error("Chat ask error:", error);
            res.status(500).json({ error: "Failed to process query" });
        }
    });

    router.delete("/chat/:id", async (req: Request, res: Response) => {
        try {
            const chatId = req.params.id;

            if (!chatService.isChatExists(chatId)) {
                return res
                    .status(404)
                    .json({ error: "Chat session not found" });
            }

            await chatService.deleteChat(chatId);
            res.json({ status: "deleted", chatId });
        } catch (error) {
            console.error("Chat delete error:", error);
            res.status(500).json({ error: "Failed to delete chat session" });
        }
    });

    router.get("/chat/:id/history", (req: Request, res: Response) => {
        try {
            const chatId = req.params.id;

            if (!chatService.isChatExists(chatId)) {
                return res
                    .status(404)
                    .json({ error: "Chat session not found" });
            }

            const history = chatService.getChatHistory(chatId);
            res.json({ chatId, history });
        } catch (error) {
            console.error("Chat history error:", error);
            res.status(500).json({ error: "Failed to get chat history" });
        }
    });

    router.get("/chats", (req: Request, res: Response) => {
        try {
            const chats = chatService.getAllChats().map((chat) => ({
                id: chat.id,
                createdAt: chat.createdAt,
                updatedAt: chat.updatedAt,
                messageCount: chat.messages.length,
            }));
            res.json({ chats });
        } catch (error) {
            console.error("Get chats error:", error);
            res.status(500).json({ error: "Failed to get chat list" });
        }
    });

    router.get("/health", async (req: Request, res: Response) => {
        try {
            const llmAvailable = await llmClient.isAvailable();
            res.json({
                status: "ok",
                timestamp: new Date().toISOString(),
                services: {
                    llm: llmAvailable ? "available" : "unavailable",
                    chat: "available",
                    orchestrator: "available",
                },
            });
        } catch (error) {
            res.status(500).json({
                status: "error",
                timestamp: new Date().toISOString(),
                error: `Health check failed: ${error}`,
            });
        }
    });

    return router;
}
