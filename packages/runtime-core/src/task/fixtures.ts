import type {
	ApprovalRequest,
	ArtifactDescriptor,
	PermissionGrant,
	RuntimeTaskEvent,
	RuntimeTaskIdentity,
	RuntimeTaskSnapshot,
	ToolRiskDescriptor,
	ToolRiskLevel,
} from "./contracts.js";
import type { RuntimeTaskIntent } from "./state-machine.js";
import { createRuntimeTaskSnapshot, transitionRuntimeTask } from "./state-machine.js";

/**
 * Deterministic Task/Artifact/Permission/Approval fixtures shared by contract
 * tests and downstream consumers (coding-agent composition tests, host
 * recovery tests). Every fixture takes explicit ids/timestamps so replays are
 * byte-stable and never depend on wall clock or randomness.
 */

export const TASK_FIXTURE_IDS = {
	session: "session-fixture-1",
	generation: "gen-fixture-1",
	task: "task-fixture-1",
	turn: "turn-fixture-1",
	approval: "approval-fixture-1",
	artifact: "artifact-fixture-1",
	grant: "grant-fixture-1",
} as const;

export function taskIdentityFixture(overrides: Partial<RuntimeTaskIdentity> = {}): RuntimeTaskIdentity {
	return {
		taskId: TASK_FIXTURE_IDS.task,
		rootSessionId: TASK_FIXTURE_IDS.session,
		...overrides,
	};
}

export function taskSnapshotFixture(overrides: Partial<RuntimeTaskSnapshot> = {}): RuntimeTaskSnapshot {
	return {
		...createRuntimeTaskSnapshot({ identity: taskIdentityFixture(), title: "Fixture task", at: 1_000 }),
		...overrides,
	};
}

export interface TaskScenarioStep {
	readonly intent: RuntimeTaskIntent;
	readonly at?: number;
}

export interface TaskScenario {
	readonly name: string;
	readonly description: string;
	readonly identity?: RuntimeTaskIdentity;
	readonly steps: readonly TaskScenarioStep[];
	/** Expected status after replaying every step. */
	readonly expectedStatus: RuntimeTaskSnapshot["status"];
}

/**
 * Replays a scenario through the real state machine, collecting the committed
 * event log and final snapshot. Tests then replay the log through
 * `rebuildRuntimeTaskSnapshot` to prove restart recovery is exact.
 */
export function runTaskScenario(scenario: TaskScenario): {
	readonly snapshot: RuntimeTaskSnapshot;
	readonly events: readonly RuntimeTaskEvent[];
} {
	let snapshot = createRuntimeTaskSnapshot({
		identity: scenario.identity ?? taskIdentityFixture(),
		title: scenario.name,
		at: 1_000,
	});
	const events: RuntimeTaskEvent[] = [
		{
			schemaVersion: 1,
			taskId: snapshot.identity.taskId,
			eventId: "evt-0",
			at: 1_000,
			type: "task.created",
			snapshot,
		},
	];
	scenario.steps.forEach((step, index) => {
		const at = step.at ?? 1_001 + index;
		const result = transitionRuntimeTask(snapshot, { eventId: `evt-${index + 1}`, at, intent: step.intent });
		snapshot = result.snapshot;
		events.push(...result.events);
	});
	return { snapshot, events };
}

/** Happy path: draft → planning → running(turn bound) → awaiting_review → completed. */
export const TASK_SCENARIO_COMPLETED: TaskScenario = {
	name: "completed",
	description: "Plan, bind a Turn, submit review, approve review.",
	steps: [
		{ intent: { type: "plan" } },
		{ intent: { type: "start", turnId: TASK_FIXTURE_IDS.turn, generation: TASK_FIXTURE_IDS.generation } },
		{ intent: { type: "attach_artifact", artifactId: TASK_FIXTURE_IDS.artifact } },
		{ intent: { type: "submit_review" } },
		{ intent: { type: "review", decision: "approved" } },
	],
	expectedStatus: "completed",
};

/** Approval gate: planning → awaiting_approval → approve(resumes the approved Turn) → review → completed. */
export const TASK_SCENARIO_APPROVED: TaskScenario = {
	name: "approved",
	description: "High-risk step waits on approval, then resumes on the approved Turn.",
	steps: [
		{ intent: { type: "plan" } },
		{ intent: { type: "request_approval", approvalId: TASK_FIXTURE_IDS.approval } },
		{
			intent: {
				type: "approval_resolved",
				approvalId: TASK_FIXTURE_IDS.approval,
				decision: "approve",
				turnId: TASK_FIXTURE_IDS.turn,
				generation: TASK_FIXTURE_IDS.generation,
			},
		},
		{ intent: { type: "submit_review" } },
		{ intent: { type: "review", decision: "approved" } },
	],
	expectedStatus: "completed",
};

/** Denied approval: task settles to rejected, not cancelled. */
export const TASK_SCENARIO_DENIED: TaskScenario = {
	name: "denied",
	description: "Approval denied while awaiting; task is rejected.",
	steps: [
		{ intent: { type: "plan" } },
		{ intent: { type: "request_approval", approvalId: TASK_FIXTURE_IDS.approval } },
		{ intent: { type: "approval_resolved", approvalId: TASK_FIXTURE_IDS.approval, decision: "deny" } },
	],
	expectedStatus: "rejected",
};

/** Review loop: changes_requested returns to planning for another attempt. */
export const TASK_SCENARIO_CHANGES_REQUESTED: TaskScenario = {
	name: "changes-requested",
	description: "Review requests changes; task re-plans and completes on second review.",
	steps: [
		{ intent: { type: "plan" } },
		{ intent: { type: "start", turnId: TASK_FIXTURE_IDS.turn, generation: TASK_FIXTURE_IDS.generation } },
		{ intent: { type: "submit_review" } },
		{ intent: { type: "review", decision: "changes_requested" } },
		{ intent: { type: "plan" } },
		{ intent: { type: "start", turnId: "turn-fixture-2", generation: "gen-fixture-2" } },
		{ intent: { type: "submit_review" } },
		{ intent: { type: "review", decision: "approved" } },
	],
	expectedStatus: "completed",
};

/** Pause/resume keeps the same Task; cancel from paused is terminal. */
export const TASK_SCENARIO_CANCELLED_FROM_PAUSE: TaskScenario = {
	name: "cancelled-from-pause",
	description: "Running task pauses, then is cancelled.",
	steps: [
		{ intent: { type: "plan" } },
		{ intent: { type: "start", turnId: TASK_FIXTURE_IDS.turn, generation: TASK_FIXTURE_IDS.generation } },
		{ intent: { type: "pause" } },
		{ intent: { type: "cancel", reason: "user" } },
	],
	expectedStatus: "cancelled",
};

/** Failure mid-run lands in failed with the reason recorded on the event. */
export const TASK_SCENARIO_FAILED: TaskScenario = {
	name: "failed",
	description: "Running task fails.",
	steps: [
		{ intent: { type: "plan" } },
		{ intent: { type: "start", turnId: TASK_FIXTURE_IDS.turn, generation: TASK_FIXTURE_IDS.generation } },
		{ intent: { type: "fail", reason: "provider-error" } },
	],
	expectedStatus: "failed",
};

export const TASK_SCENARIOS: readonly TaskScenario[] = [
	TASK_SCENARIO_COMPLETED,
	TASK_SCENARIO_APPROVED,
	TASK_SCENARIO_DENIED,
	TASK_SCENARIO_CHANGES_REQUESTED,
	TASK_SCENARIO_CANCELLED_FROM_PAUSE,
	TASK_SCENARIO_FAILED,
];

export function toolRiskDescriptorFixture(
	level: ToolRiskLevel,
	overrides: Partial<ToolRiskDescriptor> = {},
): ToolRiskDescriptor {
	return {
		defaultLevel: level,
		executionClass: level === "L0" ? "parallel-safe" : "exclusive",
		irreversible: level === "L3" || level === "L4",
		externalSideEffect: level !== "L0",
		requiredScopes: level === "L0" ? [] : [`tool.level.${level.toLowerCase()}`],
		...overrides,
	};
}

export function approvalRequestFixture(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
	return {
		schemaVersion: 1,
		approvalId: TASK_FIXTURE_IDS.approval,
		taskId: TASK_FIXTURE_IDS.task,
		sessionId: TASK_FIXTURE_IDS.session,
		turnId: TASK_FIXTURE_IDS.turn,
		toolName: "write",
		risk: toolRiskDescriptorFixture("L3"),
		summary: "Write project file",
		inputPreview: { path: "README.md" },
		affectedResources: ["README.md"],
		createdAt: 1_000,
		...overrides,
	};
}

export function artifactDescriptorFixture(overrides: Partial<ArtifactDescriptor> = {}): ArtifactDescriptor {
	return {
		schemaVersion: 1,
		artifactId: TASK_FIXTURE_IDS.artifact,
		kind: "document",
		status: "generated",
		title: "Fixture artifact",
		uri: "file:///project/output.md",
		version: 1,
		sourceTaskId: TASK_FIXTURE_IDS.task,
		sourceSessionId: TASK_FIXTURE_IDS.session,
		sourceTurnId: TASK_FIXTURE_IDS.turn,
		contentType: "text/markdown",
		createdAt: 1_000,
		updatedAt: 1_000,
		...overrides,
	};
}

export function permissionGrantFixture(overrides: Partial<PermissionGrant> = {}): PermissionGrant {
	return {
		schemaVersion: 1,
		grantId: TASK_FIXTURE_IDS.grant,
		scope: "session",
		capabilities: ["tool.write", "tool.shell"],
		source: "user",
		version: "1",
		issuedAt: 1_000,
		...overrides,
	};
}

export const PERMISSION_GRANT_FIXTURES = {
	/** Plain session grant; no expiry, no revocation. */
	active: (): PermissionGrant => permissionGrantFixture(),
	/** Self-contained expired grant: issued at 100, expired at 200 — past any realistic read time. */
	expired: (): PermissionGrant => permissionGrantFixture({ issuedAt: 100, expiresAt: 200 }),
	/** Grant explicitly revoked by the user/policy. */
	revoked: (): PermissionGrant => permissionGrantFixture({ revokedAt: 1_200 }),
	/** Allow-listed capability overridden by an explicit deny. */
	deniedCapability: (): PermissionGrant => permissionGrantFixture({ deniedCapabilities: ["tool.shell"] }),
	/** Project-scoped trust pinned to a project root. */
	project: (): PermissionGrant =>
		permissionGrantFixture({
			grantId: "grant-fixture-project",
			scope: "project",
			projectRoot: "/project",
			source: "project-policy",
		}),
} as const;

export const ARTIFACT_FIXTURES = {
	document: (): ArtifactDescriptor => artifactDescriptorFixture(),
	bundle: (): ArtifactDescriptor =>
		artifactDescriptorFixture({ artifactId: "artifact-fixture-bundle", kind: "bundle", uri: undefined }),
	missingContent: (): ArtifactDescriptor =>
		artifactDescriptorFixture({ artifactId: "artifact-fixture-missing", uri: "file:///project/deleted.md" }),
} as const;
