export { BaseReasoningStrategy } from "./base-strategy";
export { ChainOfThoughtStrategy } from "./chain-of-thought";
export { SkeletonOfThoughtStrategy } from "./skeleton-of-thought";
export { ConstrainedChainOfThoughtStrategy } from "./constrained-chain-of-thought";
export { GraphOfThoughtsStrategy } from "./graph-of-thoughts";

import { LMStudioClient } from "../../services/lm-studio-client";
import { ReasoningStrategy } from "../../types";
import { ReasoningExecutor } from "../types";
import { ChainOfThoughtStrategy } from "./chain-of-thought";
import { SkeletonOfThoughtStrategy } from "./skeleton-of-thought";
import { ConstrainedChainOfThoughtStrategy } from "./constrained-chain-of-thought";
import { GraphOfThoughtsStrategy } from "./graph-of-thoughts";

export class StrategyFactory {
    private strategies: Map<string, ReasoningExecutor>;

    constructor(llmClient: LMStudioClient) {
        this.strategies = new Map([
            ["chain_of_thought", new ChainOfThoughtStrategy(llmClient)],
            ["skeleton_of_thought", new SkeletonOfThoughtStrategy(llmClient)],
            [
                "constrained_chain_of_thought",
                new ConstrainedChainOfThoughtStrategy(llmClient),
            ],
            ["graph_of_thoughts", new GraphOfThoughtsStrategy(llmClient)],
        ]);
    }

    getStrategy(strategy: ReasoningStrategy): ReasoningExecutor {
        return (
            this.strategies.get(strategy.name) ??
            this.strategies.get("chain_of_thought")!
        );
    }
}
