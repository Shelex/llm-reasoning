export class WebSocketManager {
    constructor(wsUrl = "ws://localhost:3000/ws/chat") {
        this.wsUrl = wsUrl;
        this.websocket = null;
        this.eventHandlers = new Map();
    }

    connect(chatId) {
        if (this.websocket) {
            this.websocket.close();
        }

        this.websocket = new WebSocket(`${this.wsUrl}?chatId=${chatId}`);

        this.websocket.onopen = () => {
            console.log("WebSocket connected");
            this.emit("connected", { chatId });
        };

        this.websocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.emit("message", data);
            } catch (error) {
                console.error("Failed to parse WebSocket message:", error);
            }
        };

        this.websocket.onclose = () => {
            console.log("WebSocket disconnected");
            this.emit("disconnected");
        };

        this.websocket.onerror = (error) => {
            console.error("WebSocket error:", error);
            this.emit("error", error);
        };
    }

    disconnect() {
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
    }

    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    off(event, handler) {
        if (this.eventHandlers.has(event)) {
            const handlers = this.eventHandlers.get(event);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    emit(event, data) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).forEach((handler) => handler(data));
        }
    }

    isConnected() {
        return this.websocket && this.websocket.readyState === WebSocket.OPEN;
    }
}
