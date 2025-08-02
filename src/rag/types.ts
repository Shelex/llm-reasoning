import { Document } from "@langchain/core/documents";
import { Embeddings } from "@langchain/core/embeddings";

export interface RagConfig {
    faiss?: {
        storagePath?: string;
        autoSave?: boolean;
        saveInterval?: number;
    };
    
    
    bm25: {
        k1?: number;
        b?: number;
    };
    
    hybrid: {
        vectorWeight: number;
        bm25Weight: number;
        rerankTopK?: number;
        finalTopK?: number;
    };
    
    chunking?: {
        chunkSize?: number;
        chunkOverlap?: number;
    };
    
    embeddings: Embeddings;
    lmStudioApiUrl: string;
}

export interface ChatContext {
    chatId: string;
    documents: Document[];
    lastUpdated: Date;
}

export interface RelevantContext {
    document: Document;
    score: number;
    retriever: "vector" | "bm25" | "hybrid";
    metadata?: Record<string, unknown>;
}


export interface HybridSearchResult {
    document: Document;
    vectorScore: number;
    bm25Score: number;
    combinedScore: number;
}