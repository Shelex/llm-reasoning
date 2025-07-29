import express from "express";
import cors from "cors";
import { createServer } from "http";
import { createLLMClient } from "./services/llm";
import { RAGService } from "./services/rag";
import { Planner } from "./services/planner";
import { ChatService } from "./services/chat";
import { WebSocketService } from "./services/websocket";
import { createRoutes } from "./api/routes";
import { errorHandler, notFoundHandler } from "./utils/error-handler";

async function startServer(): Promise<void> {
    try {
        const app = express();
        const server = createServer(app);
        const port = process.env.PORT ?? 3000;

        app.use(cors());
        app.use(express.json({ limit: "10mb" }));
        app.use(express.urlencoded({ extended: true }));

        app.use(express.static("web"));

        const llmClient = createLLMClient();
        const ragService = new RAGService();

        console.log("🔧 Initializing RAG service with embeddings...");
        await ragService.initialize();
        console.log("✅ RAG service initialized successfully");

        const planner = new Planner(llmClient, ragService);
        const chatService = new ChatService(ragService);

        const webSocketService = new WebSocketService(server, chatService);

        chatService.on(
            "chat_event",
            (chatId: string, event: import("./types").ChatEvent) => {
                webSocketService.broadcastToChatRoom(chatId, event);
            }
        );
        planner.on(
            "chat_event",
            (chatId: string, event: import("./types").ChatEvent) => {
                chatService.emitEvent(chatId, event);
            }
        );

        const routes = createRoutes(chatService, planner, llmClient);
        app.use("/api", routes);

        app.use(notFoundHandler);
        app.use(errorHandler);

        server.listen(port, () => {
            console.log(`🚀 Server running on port ${port}`);
            console.log(
                `🌐 Web interface is available at http://localhost:${port}`
            );
        });

        process.on("SIGTERM", () => {
            console.log("SIGTERM received, shutting down gracefully");
            server.close(() => {
                console.log("Server closed");
                process.exit(0);
            });
        });

        process.on("SIGINT", () => {
            console.log("SIGINT received, shutting down gracefully");
            server.close(() => {
                console.log("Server closed");
                process.exit(0);
            });
        });
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}

startServer();
