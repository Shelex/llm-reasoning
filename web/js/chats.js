export class ChatManager {
    constructor(ui, apiClient) {
        this.ui = ui;
        this.apiClient = apiClient;
        this.chats = [];
        this.currentChatId = null;
        this.eventHandlers = new Map();
    }

    async loadChats() {
        try {
            this.chats = await this.apiClient.loadChats();
            this.renderChatList();
        } catch (error) {
            console.error("Failed to load chats:", error);
            throw error;
        }
    }

    renderChatList() {
        this.ui.chatList.innerHTML = "";

        if (!this.chats.length) {
            this.ui.chatList.innerHTML =
                '<div class="no-chats">No chats yet. Create one to get started!</div>';
            return;
        }

        for (const chat of this.chats) {
            const chatItem = document.createElement("div");
            chatItem.className = `chat-item ${
                chat.id === this.currentChatId ? "active" : ""
            }`;
            chatItem.dataset.chatId = chat.id;

            const createdDate = new Date(chat.createdAt).toLocaleDateString();

            chatItem.innerHTML = `
                <div class="chat-item-name">${chat.name}</div>
                <div class="chat-item-info">
                    <span>${chat.messageCount} messages</span>
                    <span>${createdDate}</span>
                </div>
            `;

            chatItem.addEventListener("click", () => this.selectChat(chat.id));
            this.ui.chatList.appendChild(chatItem);
        }
    }

    selectChat(chatId) {
        if (this.currentChatId === chatId) return;

        this.currentChatId = chatId;
        const chat = this.chats.find((c) => c.id === chatId);

        if (chat) {
            this.ui.setChatTitle(chat.name);
        }

        this.ui.showChatInterface();
        this.renderChatList();

        this.emit("chatSelected", { chatId, chat });
    }

    async createChat(name) {
        const data = await this.apiClient.createChat(name);
        await this.loadChats();
        this.selectChat(data.chatId);
        return data;
    }

    async renameChat(name) {
        if (!this.currentChatId) return;

        await this.apiClient.renameChat(this.currentChatId, name);
        this.ui.setChatTitle(name);
        await this.loadChats();
    }

    async deleteCurrentChat() {
        if (!this.currentChatId) return;

        const currentChat = this.chats.find((c) => c.id === this.currentChatId);
        if (!currentChat) return;

        if (
            !confirm(`Are you sure you want to delete "${currentChat.name}"?`)
        ) {
            return;
        }

        await this.apiClient.deleteChat(this.currentChatId);

        this.currentChatId = null;
        this.ui.showWelcomeScreen();
        await this.loadChats();

        this.emit("chatDeleted");
    }

    getCurrentChatId() {
        return this.currentChatId;
    }

    getCurrentChat() {
        return this.chats.find((c) => c.id === this.currentChatId);
    }

    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    emit(event, data) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).forEach((handler) => handler(data));
        }
    }
}
