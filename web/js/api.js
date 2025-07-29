export class ApiClient {
    constructor(baseUrl = "http://localhost:3000/api") {
        this.baseUrl = baseUrl;
    }

    async loadChats() {
        const response = await fetch(`${this.baseUrl}/chats`);
        if (!response.ok) {
            throw new Error(`Failed to load chats: ${response.statusText}`);
        }
        const data = await response.json();
        return data.chats;
    }

    async loadChatHistory(chatId) {
        const response = await fetch(`${this.baseUrl}/chat/${chatId}/history`);
        if (!response.ok) {
            throw new Error(
                `Failed to load chat history: ${response.statusText}`
            );
        }
        return await response.json();
    }

    async createChat(name) {
        const requestBody = {};
        if (name) {
            requestBody.name = name;
        }

        const response = await fetch(`${this.baseUrl}/chat/create`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            throw new Error(`Failed to create chat: ${response.statusText}`);
        }
        return await response.json();
    }

    async renameChat(chatId, name) {
        const response = await fetch(`${this.baseUrl}/chat/${chatId}/rename`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ name }),
        });

        if (!response.ok) {
            throw new Error(`Failed to rename chat: ${response.statusText}`);
        }
        return await response.json();
    }

    async deleteChat(chatId) {
        const response = await fetch(`${this.baseUrl}/chat/${chatId}`, {
            method: "DELETE",
        });

        if (!response.ok) {
            throw new Error(`Failed to delete chat: ${response.statusText}`);
        }
        return await response.json();
    }

    async sendMessage(chatId, message, reasoning = true) {
        const response = await fetch(`${this.baseUrl}/chat/${chatId}/ask`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ query: message, reason: reasoning }),
        });

        if (!response.ok) {
            throw new Error(`Failed to send message: ${response.statusText}`);
        }
        return await response.json();
    }
}
