export interface LLMResponse {
    content: string;
    confidence?: number;
    metadata?: Record<string, unknown>;
}

export interface ChatMessage {
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: Date;
}

export interface RAGContext {
    id: string;
    content: string;
    metadata: Record<string, unknown>;
    timestamp: Date;
}

export interface SubTask {
    id: string;
    query: string;
    result?: string;
    confidence?: number;
    status: "pending" | "in_progress" | "completed" | "failed";
    strategy?: ReasoningStrategy;
}

export interface ReasoningStrategy {
    name:
        | "chain_of_thought"
        | "skeleton_of_thought"
        | "constrained_chain_of_thought"
        | "graph_of_thoughts";
    parameters?: {
        reasoning?: string;
    };
}

export interface ChatSession {
    id: string;
    name: string;
    messages: ChatMessage[];
    ragContext: RAGContext[];
    createdAt: Date;
    updatedAt: Date;
}

export interface QueryRequest {
    query: string;
    reason: boolean;
}

export interface ChatEvent {
    type:
        | "connection"
        | "thinking"
        | "subtask_start"
        | "subtask_complete"
        | "validation"
        | "final_answer"
        | "processing_start"
        | "processing_end"
        | "error"
        | "context_save"
        | "context_retrieve"
        | "context_retrieved";
    data: Record<string, unknown>;
    timestamp: Date;
}
