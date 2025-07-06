import { SemanticContext, ContextFilter } from "./semantic";
import { EmbeddingsClient } from "./embeddings";

export interface FilterRule {
    type:
        | "similarity"
        | "confidence"
        | "age"
        | "contextType"
        | "metadata"
        | "crossReference";
    params: any;
    weight: number;
}

export interface RankingStrategy {
    name: string;
    rules: FilterRule[];
    description: string;
}

export class ContextRank {
    private readonly embeddingsClient: EmbeddingsClient;
    private readonly predefinedStrategies: Map<string, RankingStrategy> =
        new Map();

    constructor(embeddingsClient: EmbeddingsClient) {
        this.embeddingsClient = embeddingsClient;
        this.initializePredefinedStrategies();
    }

    private initializePredefinedStrategies(): void {
        this.predefinedStrategies.set("high_precision", {
            name: "High Precision",
            description:
                "Prioritizes high-confidence, recent, and highly relevant contexts",
            rules: [
                {
                    type: "similarity",
                    params: { minThreshold: 0.8, weight: 0.4 },
                    weight: 0.4,
                },
                {
                    type: "confidence",
                    params: { minThreshold: 0.7, weight: 0.3 },
                    weight: 0.3,
                },
                {
                    type: "age",
                    params: { maxAge: 20 * 60 * 1000, weight: 0.2 },
                    weight: 0.2,
                },
                {
                    type: "crossReference",
                    params: { weight: 0.1 },
                    weight: 0.1,
                },
            ],
        });

        this.predefinedStrategies.set("comprehensive", {
            name: "Comprehensive",
            description: "Balances relevance with diversity of information",
            rules: [
                {
                    type: "similarity",
                    params: { minThreshold: 0.6, weight: 0.3 },
                    weight: 0.3,
                },
                {
                    type: "confidence",
                    params: { minThreshold: 0.5, weight: 0.2 },
                    weight: 0.2,
                },
                {
                    type: "contextType",
                    params: {
                        typeWeights: {
                            query_result: 1.0,
                            subtask_result: 0.9,
                            synthesis: 0.8,
                        },
                        weight: 0.2,
                    },
                    weight: 0.2,
                },
                {
                    type: "age",
                    params: { maxAge: 30 * 60 * 1000, weight: 0.15 },
                    weight: 0.15,
                },
                {
                    type: "crossReference",
                    params: { weight: 0.15 },
                    weight: 0.15,
                },
            ],
        });

        this.predefinedStrategies.set("recent_focus", {
            name: "Recent Focus",
            description:
                "Heavily weights recent contexts while maintaining relevance",
            rules: [
                {
                    type: "age",
                    params: { maxAge: 15 * 60 * 1000, weight: 0.4 },
                    weight: 0.4,
                },
                {
                    type: "similarity",
                    params: { minThreshold: 0.7, weight: 0.35 },
                    weight: 0.35,
                },
                {
                    type: "confidence",
                    params: { minThreshold: 0.6, weight: 0.25 },
                    weight: 0.25,
                },
            ],
        });

        this.predefinedStrategies.set("fact_focused", {
            name: "Fact Focused",
            description: "Prioritizes high-confidence factual information",
            rules: [
                {
                    type: "confidence",
                    params: { minThreshold: 0.8, weight: 0.4 },
                    weight: 0.4,
                },
                {
                    type: "contextType",
                    params: {
                        typeWeights: {
                            query_result: 1.0,
                            subtask_result: 0.8,
                            user_input: 0.3,
                        },
                        weight: 0.3,
                    },
                    weight: 0.3,
                },
                {
                    type: "similarity",
                    params: { minThreshold: 0.75, weight: 0.3 },
                    weight: 0.3,
                },
            ],
        });
    }

    async filterAndRank(
        contexts: SemanticContext[],
        queryEmbedding: number[],
        strategy: string | RankingStrategy = "comprehensive",
        customFilter?: ContextFilter,
        topK: number = 10
    ): Promise<SemanticContext[]> {
        if (contexts.length === 0) {
            return [];
        }

        const rankingStrategy =
            typeof strategy === "string"
                ? this.predefinedStrategies.get(strategy) ||
                  this.predefinedStrategies.get("comprehensive")!
                : strategy;

        console.log(
            `🎯 [FILTER-RANKER] Applying strategy: ${rankingStrategy.name}`
        );

        let filteredContexts = customFilter
            ? this.applyBasicFilters(contexts, customFilter)
            : contexts;

        console.log(
            `🔍 [FILTER-RANKER] Basic filtering: ${filteredContexts.length}/${contexts.length} contexts`
        );

        if (!filteredContexts.length) {
            return [];
        }

        const scoredContexts = await this.applyStrategyFiltering(
            filteredContexts,
            queryEmbedding,
            rankingStrategy
        );

        const rankedContexts = scoredContexts
            .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
            .slice(0, topK);

        console.log(
            `✅ [FILTER-RANKER] Final ranking: ${rankedContexts.length} contexts selected`
        );
        return rankedContexts;
    }

    private applyBasicFilters(
        contexts: SemanticContext[],
        filter: ContextFilter
    ): SemanticContext[] {
        return contexts.filter((context) => {
            if (filter.maxAge) {
                const age = Date.now() - context.timestamp.getTime();
                if (age > filter.maxAge) return false;
            }

            if (
                filter.minConfidence &&
                context.confidence < filter.minConfidence
            ) {
                return false;
            }

            if (
                filter.contextTypes &&
                !filter.contextTypes.includes(context.contextType)
            ) {
                return false;
            }

            if (filter.metadata) {
                for (const [key, value] of Object.entries(filter.metadata)) {
                    if (context.metadata[key] !== value) {
                        return false;
                    }
                }
            }

            return true;
        });
    }

    private async applyStrategyFiltering(
        contexts: SemanticContext[],
        queryEmbedding: number[],
        strategy: RankingStrategy
    ): Promise<SemanticContext[]> {
        const scoredContexts: SemanticContext[] = [];

        for (const context of contexts) {
            let finalScore = 0;
            let passesFilters = true;

            for (const rule of strategy.rules) {
                const ruleResult = await this.evaluateRule(
                    context,
                    queryEmbedding,
                    rule,
                    contexts
                );

                if (ruleResult.passes) {
                    finalScore += ruleResult.score * rule.weight;
                } else {
                    if (rule.weight > 0.3) {
                        passesFilters = false;
                        break;
                    }
                }
            }

            if (passesFilters) {
                scoredContexts.push({
                    ...context,
                    relevanceScore: finalScore,
                });
            }
        }

        return scoredContexts;
    }

    private async evaluateRule(
        context: SemanticContext,
        queryEmbedding: number[],
        rule: FilterRule,
        allContexts: SemanticContext[]
    ): Promise<{ passes: boolean; score: number }> {
        switch (rule.type) {
            case "similarity":
                return this.evaluateSimilarityRule(
                    context,
                    queryEmbedding,
                    rule.params
                );

            case "confidence":
                return this.evaluateConfidenceRule(context, rule.params);

            case "age":
                return this.evaluateAgeRule(context, rule.params);

            case "contextType":
                return this.evaluateContextTypeRule(context, rule.params);

            case "metadata":
                return this.evaluateMetadataRule(context, rule.params);

            case "crossReference":
                return this.evaluateCrossReferenceRule(
                    context,
                    queryEmbedding,
                    rule.params,
                    allContexts
                );

            default:
                return { passes: true, score: 0 };
        }
    }

    private evaluateSimilarityRule(
        context: SemanticContext,
        queryEmbedding: number[],
        params: any
    ): { passes: boolean; score: number } {
        const similarity = this.embeddingsClient.calculateCosineSimilarity(
            queryEmbedding,
            context.embedding
        );

        const passes = similarity >= (params.minThreshold || 0.5);
        const score = similarity * (params.weight || 1.0);

        return { passes, score };
    }

    private evaluateConfidenceRule(
        context: SemanticContext,
        params: any
    ): { passes: boolean; score: number } {
        const confidence = context.confidence;
        const passes = confidence >= (params.minThreshold || 0.5);
        const score = confidence * (params.weight || 1.0);

        return { passes, score };
    }

    private evaluateAgeRule(
        context: SemanticContext,
        params: any
    ): { passes: boolean; score: number } {
        const age = Date.now() - context.timestamp.getTime();
        const maxAge = params.maxAge ?? 30 * 60 * 1000;

        const passes = age <= maxAge;

        const normalizedAge = age / maxAge;
        const score = Math.exp(-normalizedAge * 2) * (params.weight || 1.0);

        return { passes, score };
    }

    private evaluateContextTypeRule(
        context: SemanticContext,
        params: any
    ): { passes: boolean; score: number } {
        const typeWeights = params.typeWeights || {
            query_result: 1.0,
            subtask_result: 0.9,
            synthesis: 0.8,
            decomposition: 0.7,
            user_input: 0.6,
        };

        const typeScore = typeWeights[context.contextType] || 0.5;
        const passes = typeScore > 0;
        const score = typeScore * (params.weight || 1.0);

        return { passes, score };
    }

    private evaluateMetadataRule(
        context: SemanticContext,
        params: any
    ): { passes: boolean; score: number } {
        let score = 0;
        let matchCount = 0;
        let totalChecks = 0;

        for (const [key, expectedValue] of Object.entries(
            params.requirements || {}
        )) {
            totalChecks++;
            if (context.metadata[key] === expectedValue) {
                matchCount++;
                score += 1.0;
            }
        }

        const passes =
            totalChecks === 0 ||
            matchCount / totalChecks >= (params.minMatchRatio || 0.5);
        const normalizedScore =
            totalChecks > 0
                ? (score / totalChecks) * (params.weight || 1.0)
                : 0;

        return { passes, score: normalizedScore };
    }

    private async evaluateCrossReferenceRule(
        context: SemanticContext,
        queryEmbedding: number[],
        params: any,
        allContexts: SemanticContext[]
    ): Promise<{ passes: boolean; score: number }> {
        const similarities = allContexts
            .filter((ctx) => ctx.id !== context.id)
            .map((ctx) =>
                this.embeddingsClient.calculateCosineSimilarity(
                    context.embedding,
                    ctx.embedding
                )
            );

        const crossReferences = similarities.filter((sim) => sim > 0.7).length;

        const score =
            Math.min(crossReferences / 3, 1.0) * (params.weight || 1.0);

        return { passes: true, score };
    }

    createCustomStrategy(
        name: string,
        description: string,
        rules: FilterRule[]
    ): RankingStrategy {
        return { name, description, rules };
    }

    registerStrategy(strategy: RankingStrategy): void {
        this.predefinedStrategies.set(
            strategy.name.toLowerCase().replace(/\s+/g, "_"),
            strategy
        );
    }

    getAvailableStrategies(): string[] {
        return Array.from(this.predefinedStrategies.keys());
    }

    getStrategyDescription(strategyName: string): string {
        const strategy = this.predefinedStrategies.get(strategyName);
        return strategy ? strategy.description : "Strategy not found";
    }

    async diversityFilter(
        contexts: SemanticContext[],
        maxSimilarity: number = 0.8
    ): Promise<SemanticContext[]> {
        if (contexts.length <= 1) return contexts;

        const diverseContexts = [contexts[0]];

        for (let i = 1; i < contexts.length; i++) {
            const candidate = contexts[i];
            let isSimilar = false;

            for (const selected of diverseContexts) {
                const similarity =
                    this.embeddingsClient.calculateCosineSimilarity(
                        candidate.embedding,
                        selected.embedding
                    );

                if (similarity > maxSimilarity) {
                    isSimilar = true;
                    break;
                }
            }

            if (!isSimilar) {
                diverseContexts.push(candidate);
            }
        }

        console.log(
            `🎨 [FILTER-RANKER] Diversity filtering: ${diverseContexts.length}/${contexts.length} contexts`
        );
        return diverseContexts;
    }

    async temporalCoherence(
        contexts: SemanticContext[],
        maxTimeGap: number = 10 * 60 * 1000
    ): Promise<SemanticContext[]> {
        if (contexts.length <= 1) return contexts;

        const sortedContexts = contexts.sort(
            (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
        );

        const coherentGroups: SemanticContext[][] = [];
        let currentGroup: SemanticContext[] = [sortedContexts[0]];

        for (let i = 1; i < sortedContexts.length; i++) {
            const current = sortedContexts[i];
            const previous = currentGroup[currentGroup.length - 1];
            const timeGap =
                current.timestamp.getTime() - previous.timestamp.getTime();

            if (timeGap <= maxTimeGap) {
                currentGroup.push(current);
            } else {
                coherentGroups.push(currentGroup);
                currentGroup = [current];
            }
        }

        if (currentGroup.length > 0) {
            coherentGroups.push(currentGroup);
        }

        const selectedContexts = coherentGroups.map((group) =>
            group.reduce((best, context) =>
                (context.relevanceScore || 0) > (best.relevanceScore || 0)
                    ? context
                    : best
            )
        );

        console.log(
            `⏰ [FILTER-RANKER] Temporal coherence: ${selectedContexts.length} groups from ${contexts.length} contexts`
        );
        return selectedContexts;
    }
}
