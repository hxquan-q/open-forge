// Modified by The Open Forge contributors.
import { defineRuntimeObservation, type RuntimeObservationFailure } from "@vetta/runtime-core";
import type { SubagentSchedulingEvent } from "@vetta/runtime-subagents";

export type CodingAgentSubagentIssueOperation =
	| "coordinator"
	| "recovery"
	| "notification-delivery"
	| "report-delivery"
	| "session-observation";

export interface CodingAgentSubagentIssueObservation {
	readonly operation: CodingAgentSubagentIssueOperation;
	readonly failure: RuntimeObservationFailure;
}

export const CODING_AGENT_SUBAGENT_ISSUE_OBSERVATION = defineRuntimeObservation<CodingAgentSubagentIssueObservation>(
	"coding-agent.subagent",
	"issue",
	"warning",
);

export const CODING_AGENT_SUBAGENT_SCHEDULING_OBSERVATION = defineRuntimeObservation<SubagentSchedulingEvent>(
	"coding-agent.subagent",
	"scheduling",
	"debug",
);
