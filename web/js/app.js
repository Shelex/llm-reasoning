import { ApiClient } from "./api.js";
import { WebSocketManager } from "./websocket-manager.js";
import { UIElements } from "./ui-elements.js";
import { ChatManager } from "./chats.js";
import { MessageRenderer } from "./message-renderer.js";
import { EventsManager } from "./events-manager.js";

export class App {
    constructor() {
        this.ui = new UIElements();
        this.apiClient = new ApiClient();
        this.wsManager = new WebSocketManager();
        this.chatManager = new ChatManager(this.ui, this.apiClient);
        this.messageRenderer = new MessageRenderer(this.ui);
        this.eventsManager = new EventsManager(this.ui);

        this.bindEvents();
        this.setupWebSocketHandlers();
        this.setupChatManagerHandlers();
        this.init();
    }

    async init() {
        try {
            await this.chatManager.loadChats();
        } catch (error) {
            console.error("Failed to initialize app:", error);
            this.messageRenderer.showError("Failed to load chats");
        }
    }

    bindEvents() {
        this.ui.createChatBtn.addEventListener("click", () =>
            this.openCreateChatModal()
        );
        this.ui.sendMessageBtn.addEventListener("click", () =>
            this.sendMessage()
        );
        this.ui.renameChatBtn.addEventListener("click", () =>
            this.openRenameChatModal()
        );
        this.ui.deleteChatBtn.addEventListener("click", () =>
            this.deleteCurrentChat()
        );

        this.ui.eventsModalClose.addEventListener("click", () =>
            this.ui.hideEventsModal()
        );
        this.ui.eventsModal.addEventListener("click", (e) => {
            if (e.target === this.ui.eventsModal) {
                this.ui.hideEventsModal();
            }
        });

        this.ui.confirmModalBtn.addEventListener("click", () =>
            this.handleModalConfirm()
        );
        this.ui.cancelModalBtn.addEventListener("click", () =>
            this.ui.hideModal()
        );
        this.ui.closeModal.addEventListener("click", () => this.ui.hideModal());

        this.ui.messageInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // handle backdrop click
        this.ui.chatModal.addEventListener("click", (e) => {
            if (e.target === this.ui.chatModal) {
                this.ui.hideModal();
            }
        });
    }

    setupWebSocketHandlers() {
        this.wsManager.on("message", (event) =>
            this.handleWebSocketMessage(event)
        );
        this.wsManager.on("connected", (data) =>
            console.log("Connected to chat:", data.chatId)
        );
        this.wsManager.on("disconnected", () =>
            console.log("WebSocket disconnected")
        );
        this.wsManager.on("error", (error) =>
            console.error("WebSocket error:", error)
        );
    }

    setupChatManagerHandlers() {
        this.chatManager.on("chatSelected", async ({ chatId }) => {
            this.wsManager.disconnect();
            this.eventsManager.clearEvents();
            await this.messageRenderer.loadAndRenderHistory(
                chatId,
                this.apiClient
            );
            this.wsManager.connect(chatId);
        });

        this.chatManager.on("chatDeleted", () => {
            this.wsManager.disconnect();
            this.eventsManager.clearEvents();
        });
    }

    handleWebSocketMessage(event) {
        this.eventsManager.addEvent(event);

        switch (event.type) {
            case "connection":
                break;
            case "processing_start":
                this.messageRenderer.showThinkingIndicator(() =>
                    this.openEventsModal()
                );
                break;
            case "processing_end":
                this.messageRenderer.hideThinkingIndicator();
                this.messageRenderer.loadAndRenderHistory(
                    this.chatManager.getCurrentChatId(),
                    this.apiClient
                );
                break;
            case "thinking":
                this.messageRenderer.updateThinkingIndicator(event.data.stage);
                break;
            case "error":
                this.messageRenderer.hideThinkingIndicator();
                this.messageRenderer.showError(`Error: ${event.data.error}`);
                break;
        }
    }

    async sendMessage() {
        const message = this.ui.getMessageInput();
        const currentChatId = this.chatManager.getCurrentChatId();

        if (!message || !currentChatId) return;

        const reasoning = this.ui.getReasoningEnabled();

        this.messageRenderer.addUserMessage(message);
        this.ui.clearMessageInput();

        try {
            await this.apiClient.sendMessage(currentChatId, message, reasoning);
        } catch (error) {
            console.error("Failed to send message:", error);
            this.messageRenderer.showError("Failed to send message");
            this.messageRenderer.hideThinkingIndicator();
        }
    }

    openCreateChatModal() {
        this.ui.showModal(
            "Create New Chat",
            "Create",
            "Enter chat name (optional)...",
            "",
            "create"
        );
    }

    openRenameChatModal() {
        const currentChat = this.chatManager.getCurrentChat();
        if (!currentChat) return;

        this.ui.showModal(
            "Rename Chat",
            "Rename",
            "Enter new chat name...",
            currentChat.name,
            "rename"
        );
    }

    async handleModalConfirm() {
        const name = this.ui.getModalInput();
        const mode = this.ui.getModalMode();

        if (mode === "rename" && !name) {
            this.ui.chatNameInput.focus();
            return;
        }

        try {
            if (mode === "create") {
                await this.chatManager.createChat(name);
            } else if (mode === "rename") {
                await this.chatManager.renameChat(name);
            }
            this.ui.hideModal();
        } catch (error) {
            console.error(`Failed to ${mode} chat:`, error);
            this.messageRenderer.showError(`Failed to ${mode} chat`);
        }
    }

    async deleteCurrentChat() {
        try {
            await this.chatManager.deleteCurrentChat();
        } catch (error) {
            console.error("Failed to delete chat:", error);
            this.messageRenderer.showError("Failed to delete chat");
        }
    }

    openEventsModal() {
        this.ui.showEventsModal();
        this.eventsManager.renderEventsHistory();
    }

    toggleEventPayload(eventId) {
        this.eventsManager.toggleEventPayload(eventId);
    }

    clearEvents() {
        this.eventsManager.confirmClearEvents();
    }
}
