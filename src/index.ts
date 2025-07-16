import express from "express";
import cors from "cors";
import { createServer } from "http";
import { LMStudioClient } from "./services/lm-studio-client";
import { RAGService } from "./services/rag-service";
import { OrchestratorService } from "./services/orchestrator-service";
import { ChatService } from "./services/chat-service";
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

        const llmClient = new LMStudioClient(process.env.LM_STUDIO_URL);
        const ragService = new RAGService();

        console.log("🔧 Initializing RAG service with embeddings...");
        await ragService.initialize();
        console.log("✅ RAG service initialized successfully");

        const orchestratorService = new OrchestratorService(
            llmClient,
            ragService
        );
        const chatService = new ChatService(ragService);

        const routes = createRoutes(
            chatService,
            orchestratorService,
            llmClient
        );
        app.use("/api", routes);

        app.use(notFoundHandler);
        app.use(errorHandler);

        server.listen(port, () => {
            console.log(`🚀 Server running on port ${port}`);
            console.log(
                `🧠 LLM client configured for ${
                    process.env.LM_STUDIO_URL ?? "http://localhost:1234"
                }`
            );
            console.log(
                `🧠 RAG service with LangChain embeddings and intelligent context management`
            );
            console.log(
                `✨ Answer beautification enabled for natural, human-like responses`
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
