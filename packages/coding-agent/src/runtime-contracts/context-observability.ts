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
