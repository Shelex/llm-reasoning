export class UIElements {
    constructor() {
        this.initializeElements();
    }

    initializeElements() {
        this.chatList = document.getElementById("chatList");
        this.welcomeScreen = document.getElementById("welcomeScreen");
        this.chatInterface = document.getElementById("chatInterface");
        this.messagesContainer = document.getElementById("messagesContainer");
        this.eventsContainer = document.getElementById("eventsContainer");
        this.chatTitle = document.getElementById("chatTitle");

        this.eventsModal = document.getElementById("eventsModal");
        this.eventsModalClose = document.getElementById("eventsModalClose");

        this.messageInput = document.getElementById("messageInput");
        this.reasoningToggle = document.getElementById("reasoningToggle");

        this.createChatBtn = document.getElementById("createChatBtn");
        this.sendMessageBtn = document.getElementById("sendMessageBtn");
        this.renameChatBtn = document.getElementById("renameChatBtn");
        this.deleteChatBtn = document.getElementById("deleteChatBtn");

        this.chatModal = document.getElementById("chatModal");
        this.modalTitle = document.getElementById("modalTitle");
        this.chatNameInput = document.getElementById("chatNameInput");
        this.confirmModalBtn = document.getElementById("confirmModalBtn");
        this.cancelModalBtn = document.getElementById("cancelModalBtn");
        this.closeModal = this.chatModal.querySelector(".close");
    }

    showWelcomeScreen() {
        this.welcomeScreen.style.display = "flex";
        this.chatInterface.style.display = "none";
    }

    showChatInterface() {
        this.welcomeScreen.style.display = "none";
        this.chatInterface.style.display = "flex";
    }

    setChatTitle(title) {
        this.chatTitle.textContent = title;
    }

    clearMessageInput() {
        this.messageInput.value = "";
    }

    getMessageInput() {
        return this.messageInput.value.trim();
    }

    getReasoningEnabled() {
        return this.reasoningToggle.checked;
    }

    showModal(
        title,
        buttonText,
        placeholder = "",
        value = "",
        mode = "create"
    ) {
        this.modalTitle.textContent = title;
        this.confirmModalBtn.textContent = buttonText;
        this.chatNameInput.placeholder = placeholder;
        this.chatNameInput.value = value;
        this.chatModal.style.display = "block";
        this.chatModal.dataset.mode = mode;

        if (value) {
            this.chatNameInput.select();
        } else {
            this.chatNameInput.focus();
        }
    }

    hideModal() {
        this.chatModal.style.display = "none";
        this.chatNameInput.value = "";
    }

    getModalInput() {
        return this.chatNameInput.value.trim();
    }

    getModalMode() {
        return this.chatModal.dataset.mode;
    }

    showEventsModal() {
        this.eventsModal.style.display = "block";
    }

    hideEventsModal() {
        this.eventsModal.style.display = "none";
    }

    isEventsModalOpen() {
        return this.eventsModal.style.display === "block";
    }
}
