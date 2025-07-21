import WebSocket from "ws";
import { Server, IncomingMessage } from "http";
import { parse } from "url";
import { ChatEvent } from "../types";
import { ChatService } from "./chat";

interface VerifyClientInfo {
    req: IncomingMessage;
}

export class WebSocketService {
    private readonly wss: WebSocket.Server;
    private readonly chat: ChatService;
    private readonly chatConnections: Map<string, Set<WebSocket>> = new Map();

    constructor(server: Server, chat: ChatService) {
        this.chat = chat;
        this.wss = new WebSocket.Server({
            server,
            path: "/ws/chat",
            verifyClient: (info: VerifyClientInfo) => {
                const url = parse(info.req.url ?? "", true);
                const chatId = url.query.chatId;
                if (!chatId || typeof chatId !== "string" || !chatId.length) {
                    return false;
                }
                return this.chat.isChatExists(chatId);
            },
        });

        this.wss.on("connection", this.handleConnection.bind(this));
    }

    private handleConnection(ws: WebSocket, request: IncomingMessage): void {
        const url = parse(request.url ?? "", true);
        const chatId = url.query.chatId as string;

        console.log(`🔌 WebSocket connection established for chat: ${chatId}`);

        if (!this.chatConnections.has(chatId)) {
            this.chatConnections.set(chatId, new Set());
        }
        this.chatConnections.get(chatId)!.add(ws);

        this.sendToClient(ws, {
            type: "connection",
            data: { chatId, status: "connected" },
            timestamp: new Date(),
        });

        ws.on("close", () => {
            console.log(`🔌 WebSocket connection closed for chat: ${chatId}`);
            const connections = this.chatConnections.get(chatId);
            if (connections) {
                connections.delete(ws);
                if (connections.size === 0) {
                    this.chatConnections.delete(chatId);
                }
            }
        });

        ws.on("error", (error) => {
            console.error(`🔌 WebSocket error for chat ${chatId}:`, error);
        });
    }

    private sendToClient(ws: WebSocket, event: ChatEvent): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(event));
        }
    }

    public broadcastToChatRoom(chatId: string, event: ChatEvent): void {
        const connections = this.chatConnections.get(chatId);
        if (!connections) {
            return;
        }

        const message = JSON.stringify(event);

        for (const connection of connections) {
            if (connection.readyState === WebSocket.OPEN) {
                connection.send(message);
            }
        }

        console.log(
            `📡 Broadcasted ${event.type} event to ${connections.size} clients for chat: ${chatId}`
        );
    }

    public getConnectedClientsCount(chatId: string): number {
        const connections = this.chatConnections.get(chatId);
        return connections ? connections.size : 0;
    }

    public close() {
        this.wss.close();
    }
}
