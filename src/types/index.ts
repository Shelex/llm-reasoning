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
    parameters?: Record<string, unknown>;
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
        | "thinking"
        | "classification"
        | "subtask_start"
        | "subtask_complete"
        | "validation"
        | "final_answer";
    data: Record<string, unknown>;
    timestamp: Date;
}

export interface QueryClassification {
    refinedQuery: string;
    intent: "fact" | "comparison" | "reasoning" | "clarification" | "instruction" | "other";
    complexity: "simple" | "complex";
    suggestedSubQuestions: string[];
    originalQuery: string;
    confidence: number;
}
