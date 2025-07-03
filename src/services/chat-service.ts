import { v4 as uuidv4 } from "uuid";
import { ChatSession, ChatMessage, ChatEvent } from "../types";
import { RAGService } from "./rag-service";
import { EventEmitter } from "events";

export class ChatService extends EventEmitter {
    private sessions: Map<string, ChatSession> = new Map();
    private ragService: RAGService;

    constructor(ragService: RAGService) {
        super();
        this.ragService = ragService;
    }

    createChat(): string {
        const chatId = uuidv4();
        const session: ChatSession = {
            id: chatId,
            messages: [],
            ragContext: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        this.sessions.set(chatId, session);
        return chatId;
    }

    getChat(chatId: string): ChatSession | undefined {
        return this.sessions.get(chatId);
    }

    addMessage(
        chatId: string,
        role: ChatMessage["role"],
        content: string
    ): void {
        const session = this.sessions.get(chatId);
        if (!session) {
            throw new Error(`Chat session ${chatId} not found`);
        }

        const message: ChatMessage = {
            role,
            content,
            timestamp: new Date(),
        };

        session.messages.push(message);
        session.updatedAt = new Date();
    }

    async deleteChat(chatId: string): Promise<void> {
        const session = this.sessions.get(chatId);
        if (!session) {
            throw new Error(`Chat session ${chatId} not found`);
        }

        await this.ragService.clearContext(chatId);
        this.sessions.delete(chatId);
    }

    getChatHistory(chatId: string): ChatMessage[] {
        const session = this.sessions.get(chatId);
        if (!session) {
            throw new Error(`Chat session ${chatId} not found`);
        }

        return session.messages;
    }

    getAllChats(): ChatSession[] {
        return Array.from(this.sessions.values());
    }

    emitChatEvent(chatId: string, event: ChatEvent): void {
        this.emit("chat_event", chatId, event);
    }

    isChatExists(chatId: string): boolean {
        return this.sessions.has(chatId);
    }
}
