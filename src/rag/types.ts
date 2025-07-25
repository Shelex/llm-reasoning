import { Document } from "@langchain/core/documents";
import { Embeddings } from "@langchain/core/embeddings";

export interface RAG3Config {
    qdrant: {
        url: string;
        apiKey?: string;
        collectionName: string;
        vectorSize?: number;
        distance?: "Cosine" | "Euclid" | "Dot";
    };
    
    colbert: {
        modelName: string;
        apiUrl: string;
        topK?: number;
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

export interface ColBERTRerankRequest {
    query: string;
    documents: string[];
}

export interface ColBERTRerankResponse {
    scores: number[];
}

export interface HybridSearchResult {
    document: Document;
    vectorScore: number;
    bm25Score: number;
    combinedScore: number;
    rerankScore?: number;
}