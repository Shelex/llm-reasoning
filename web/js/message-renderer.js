export class MessageRenderer {
    constructor(ui) {
        this.ui = ui;
        this.thinkingIndicatorId = "thinkingIndicator";
    }

    async loadAndRenderHistory(chatId, apiClient) {
        try {
            const data = await apiClient.loadChatHistory(chatId);
            this.renderMessages(data.history);
        } catch (error) {
            console.error("Failed to load chat history:", error);
            this.showError("Failed to load chat history");
        }
    }

    renderMessages(messages) {
        this.ui.messagesContainer.innerHTML = "";
        messages.forEach((message) => this.addMessageToUI(message));
        this.scrollToBottom();
    }

    addMessageToUI(message) {
        const messageDiv = document.createElement("div");
        messageDiv.className = `message ${message.role}`;

        const timestamp = new Date(message.timestamp).toLocaleTimeString();

        messageDiv.innerHTML = `
            <div class="message-content">${this.formatMessage(
                message.content
            )}</div>
            <div class="message-timestamp">${timestamp}</div>
        `;

        this.ui.messagesContainer.appendChild(messageDiv);
    }

    formatMessage(content) {
        return content.replace(/\n/g, "<br>");
    }

    scrollToBottom() {
        // use requestAnimationFrame to ensure DOM is updated before scrolling
        requestAnimationFrame(() => {
            this.ui.messagesContainer.scrollTop = this.ui.messagesContainer.scrollHeight;
        });
    }

    scrollToTop() {
        this.ui.messagesContainer.scrollTop = 0;
    }

    isScrolledToBottom() {
        const container = this.ui.messagesContainer;
        return container.scrollTop >= (container.scrollHeight - container.clientHeight - 10);
    }

    showThinkingIndicator(onClickHandler) {
        this.hideThinkingIndicator();

        const indicator = document.createElement("div");
        indicator.id = this.thinkingIndicatorId;
        indicator.className = "thinking-indicator";
        indicator.textContent = "Thinking...";
        indicator.addEventListener("click", onClickHandler);

        this.ui.messagesContainer.appendChild(indicator);
        this.scrollToBottom();
    }

    updateThinkingIndicator(stage) {
        const indicator = document.getElementById(this.thinkingIndicatorId);
        if (indicator) {
            indicator.textContent = `Thinking: ${stage.replace(/_/g, " ")}...`;
        }
    }

    hideThinkingIndicator() {
        const indicator = document.getElementById(this.thinkingIndicatorId);
        if (indicator) {
            indicator.remove();
        }
    }

    showError(message) {
        const existingErrors = document.querySelectorAll(".error-message");
        existingErrors.forEach((error) => error.remove());

        const errorDiv = document.createElement("div");
        errorDiv.className = "error-message";
        errorDiv.textContent = message;

        this.ui.messagesContainer.appendChild(errorDiv);
        this.scrollToBottom();

        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 5000);
    }

    addUserMessage(message) {
        this.addMessageToUI({
            role: "user",
            content: message,
            timestamp: new Date().toISOString(),
        });
        this.scrollToBottom();
    }
}
