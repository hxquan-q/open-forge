// Modified by The Open Forge contributors.
import { defineRuntimeObservation, type RuntimeObservationFailure } from "@vetta/runtime-core";

export interface CodingAgentCompactionPrefireObservation {
	readonly phase: "cached" | "failed" | "cancelled";
	readonly tokensBefore?: number;
	readonly failure?: RuntimeObservationFailure;
}

export const CODING_AGENT_COMPACTION_PREFIRE_OBSERVATION =
	defineRuntimeObservation<CodingAgentCompactionPrefireObservation>(
		"coding-agent.context",
		"compaction-prefire",
		"debug",
	);

export interface CodingAgentCompactionBackpressureObservation {
	readonly phase: "suppressed";
	readonly reason: "in_flight" | "cooldown";
	readonly trigger: "threshold" | "overflow";
	readonly contextTokens: number;
	readonly contextWindow: number;
}

export const CODING_AGENT_COMPACTION_BACKPRESSURE_OBSERVATION =
	defineRuntimeObservation<CodingAgentCompactionBackpressureObservation>(
		"coding-agent.context",
		"compaction-backpressure",
		"debug",
	);

export interface CodingAgentContextBudgetObservation {
	readonly trigger: "turn_start" | "model_call" | "assistant_result" | "assistant_error";
	readonly suppression: "compaction_disabled" | "context_unavailable" | "non_overflow_error";
	readonly contextTokens: number;
	readonly contextWindow: number;
	readonly overByTokens: number;
}

export const CODING_AGENT_CONTEXT_BUDGET_OBSERVATION = defineRuntimeObservation<CodingAgentContextBudgetObservation>(
	"coding-agent.context",
	"context-budget-exceeded",
	"warning",
);
