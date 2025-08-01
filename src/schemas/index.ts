import { z } from "zod";

export const TaskDecompositionSchema = z.object({
    plan: z.array(
        z.object({
            id: z.string(),
            task: z.string(),
        })
    ),
});

export const ReasoningStrategySchema = z.object({
    selected_strategy: z.enum([
        "chain_of_thought",
        "skeleton_of_thought",
        "constrained_chain_of_thought",
        "graph_of_thoughts",
    ]),
    explanation: z.string(),
});

export const ConfidenceSchema = z.object({
    confidence_score: z.number().min(0).max(1),
    reasoning: z.object({
        factual_accuracy: z.number().min(0).max(1),
        certainty_of_language: z.number().min(0).max(1),
        completeness_of_answer: z.number().min(0).max(1),
        presence_of_uncertainty_words: z.number().min(0).max(1),
        breakdown: z.object({
            factual_accuracy: z.string(),
            certainty_of_language: z.string(),
            completeness_of_answer: z.string(),
            presence_of_uncertainty_words: z.string(),
        }),
    }),
});

export type TaskDecompositionResponse = z.infer<typeof TaskDecompositionSchema>;
export type ReasoningStrategyResponse = z.infer<typeof ReasoningStrategySchema>;
export type ConfidenceAssessmentResponse = z.infer<typeof ConfidenceSchema>;
