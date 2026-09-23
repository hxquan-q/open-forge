import type {
	ApprovalDecision,
	ArtifactDescriptor,
	PermissionGrant,
	RuntimeTaskEvent,
	RuntimeTaskIdentity,
	RuntimeTaskSnapshot,
	RuntimeTaskStatus,
} from "./contracts.js";
import { RUNTIME_TASK_TERMINAL_STATUSES } from "./contracts.js";

/**
 * Executable Task contract: the state machine and replay reducer that later
 * vertical slices must satisfy. Pure and clock-injected so fixtures can pin
 * exact event order without timers.
 */

export const RUNTIME_TASK_ERROR_CODES = {
	INVALID_TRANSITION: "task_invalid_transition",
	MISSING_TURN_BINDING: "task_missing_turn_binding",
	UNKNOWN_APPROVAL: "task_unknown_approval",
	DUPLICATE_ARTIFACT: "task_duplicate_artifact",
	EVENT_LOG_INVALID: "task_event_log_invalid",
	TASK_NOT_FOUND: "task_not_found",
} as const;

export type RuntimeTaskErrorCode = (typeof RUNTIME_TASK_ERROR_CODES)[keyof typeof RUNTIME_TASK_ERROR_CODES];

export class RuntimeTaskError extends Error {
	readonly code: RuntimeTaskErrorCode;
	readonly details?: Readonly<Record<string, unknown>>;

	constructor(code: RuntimeTaskErrorCode, message: string, details?: Readonly<Record<string, unknown>>) {
		super(message);
		this.name = "RuntimeTaskError";
		this.code = code;
		this.details = details;
	}
}

/** Transition intents; the "why" is explicit so consumers never encode it as string conventions. */
export type RuntimeTaskIntent =
	| { readonly type: "plan" }
	| { readonly type: "request_approval"; readonly approvalId: string }
	| {
			readonly type: "approval_resolved";
			readonly approvalId: string;
			readonly decision: ApprovalDecision;
			/** Approved decisions resume on the approved Turn; required iff decision is not "deny". */
			readonly turnId?: string;
			/** Snapshot/Lease generation acquired for `turnId`; required iff decision is not "deny". */
			readonly generation?: string;
	  }
	| {
			readonly type: "start";
			readonly turnId: string;
			/** Snapshot/Lease generation acquired for this Turn. */
			readonly generation: string;
	  }
	| { readonly type: "pause" }
	| {
			readonly type: "resume";
			readonly turnId: string;
			/** Snapshot/Lease generation acquired for this Turn. */
			readonly generation: string;
	  }
	| { readonly type: "submit_review" }
	| { readonly type: "review"; readonly decision: "approved" | "changes_requested" | "rejected" }
	| { readonly type: "attach_artifact"; readonly artifactId: string }
	| { readonly type: "fail"; readonly reason?: string }
	| { readonly type: "cancel"; readonly reason?: string };

const STATUS_TRANSITIONS: Readonly<Record<RuntimeTaskStatus, readonly RuntimeTaskStatus[]>> = {
	draft: ["planning", "cancelled"],
	planning: ["awaiting_approval", "running", "failed", "cancelled"],
	awaiting_approval: ["running", "rejected", "cancelled"],
	running: ["paused", "awaiting_review", "failed", "cancelled"],
	paused: ["running", "cancelled"],
	awaiting_review: ["completed", "changes_requested", "rejected", "cancelled"],
	changes_requested: ["planning", "cancelled"],
	completed: [],
	failed: [],
	cancelled: [],
	rejected: [],
};

const INTENT_TARGET: Readonly<Record<RuntimeTaskIntent["type"], RuntimeTaskStatus | undefined>> = {
	plan: "planning",
	request_approval: "awaiting_approval",
	approval_resolved: undefined, // decision-dependent
	start: "running",
	pause: "paused",
	resume: "running",
	submit_review: "awaiting_review",
	review: undefined, // decision-dependent
	attach_artifact: undefined, // status unchanged
	fail: "failed",
	cancel: "cancelled",
};

export function isRuntimeTaskTerminal(status: RuntimeTaskStatus): boolean {
	return (RUNTIME_TASK_TERMINAL_STATUSES as readonly RuntimeTaskStatus[]).includes(status);
}

export function canTransitionRuntimeTask(from: RuntimeTaskStatus, to: RuntimeTaskStatus): boolean {
	return STATUS_TRANSITIONS[from].includes(to);
}

export interface RuntimeTaskTransitionInput {
	readonly eventId: string;
	readonly at: number;
	readonly intent: RuntimeTaskIntent;
}

export interface RuntimeTaskTransitionResult {
	readonly snapshot: RuntimeTaskSnapshot;
	/** Ordered events committed by this transition; replay must reproduce the snapshot. */
	readonly events: readonly RuntimeTaskEvent[];
}

function approvalDecisionTarget(decision: ApprovalDecision): RuntimeTaskStatus {
	switch (decision) {
		case "approve":
		case "approve_once":
		case "edit":
			return "running";
		case "deny":
			return "rejected";
	}
}

function reviewDecisionTarget(decision: "approved" | "changes_requested" | "rejected"): RuntimeTaskStatus {
	switch (decision) {
		case "approved":
			return "completed";
		case "changes_requested":
			return "changes_requested";
		case "rejected":
			return "rejected";
	}
}

function assertTransition(from: RuntimeTaskStatus, to: RuntimeTaskStatus, intent: RuntimeTaskIntent): void {
	if (!canTransitionRuntimeTask(from, to)) {
		throw new RuntimeTaskError(
			RUNTIME_TASK_ERROR_CODES.INVALID_TRANSITION,
			`task cannot transition from "${from}" to "${to}" via "${intent.type}"`,
			{ from, to, intent: intent.type },
		);
	}
}

/**
 * Validates and commits one transition, returning the next snapshot plus the
 * ordered events to persist. `identity` is carried through untouched:
 * generation/Session binding never changes inside a Task's lifetime.
 */
export function transitionRuntimeTask(
	snapshot: RuntimeTaskSnapshot,
	input: RuntimeTaskTransitionInput,
): RuntimeTaskTransitionResult {
	const { intent } = input;
	const events: RuntimeTaskEvent[] = [];
	const base = { schemaVersion: 1 as const, taskId: snapshot.identity.taskId, at: input.at };
	let seq = 0;
	const nextEventId = (): string => `${input.eventId}:${seq++}`;
	const statusEvent = (from: RuntimeTaskStatus, to: RuntimeTaskStatus, reason?: string): void => {
		events.push({
			...base,
			eventId: nextEventId(),
			type: "task.status_changed",
			from,
			to,
			...(reason === undefined ? {} : { reason }),
		});
	};

	let status = snapshot.status;
	let activeTurnId = snapshot.activeTurnId;
	let activeGeneration = snapshot.activeGeneration;
	let artifactIds = snapshot.artifactIds;
	let pendingApprovalIds = snapshot.pendingApprovalIds;

	switch (intent.type) {
		case "attach_artifact": {
			if (isRuntimeTaskTerminal(status)) {
				throw new RuntimeTaskError(
					RUNTIME_TASK_ERROR_CODES.INVALID_TRANSITION,
					`terminal task cannot attach artifacts`,
					{ status, intent: intent.type },
				);
			}
			if (artifactIds.includes(intent.artifactId)) {
				throw new RuntimeTaskError(
					RUNTIME_TASK_ERROR_CODES.DUPLICATE_ARTIFACT,
					`artifact "${intent.artifactId}" is already attached`,
					{ artifactId: intent.artifactId },
				);
			}
			events.push({
				...base,
				eventId: nextEventId(),
				type: "task.artifact_attached",
				artifactId: intent.artifactId,
			});
			artifactIds = [...artifactIds, intent.artifactId];
			break;
		}
		case "request_approval": {
			assertTransition(status, "awaiting_approval", intent);
			events.push({
				...base,
				eventId: nextEventId(),
				type: "task.approval_requested",
				approvalId: intent.approvalId,
			});
			statusEvent(status, "awaiting_approval");
			status = "awaiting_approval";
			pendingApprovalIds = [...pendingApprovalIds, intent.approvalId];
			break;
		}
		case "approval_resolved": {
			if (!pendingApprovalIds.includes(intent.approvalId)) {
				throw new RuntimeTaskError(
					RUNTIME_TASK_ERROR_CODES.UNKNOWN_APPROVAL,
					`approval "${intent.approvalId}" is not pending on this task`,
					{ approvalId: intent.approvalId },
				);
			}
			const to = approvalDecisionTarget(intent.decision);
			assertTransition(status, to, intent);
			if (to === "running") {
				if (!intent.turnId || !intent.generation) {
					throw new RuntimeTaskError(
						RUNTIME_TASK_ERROR_CODES.MISSING_TURN_BINDING,
						"approved task must resume on the approved Turn and generation",
					);
				}
			}
			events.push({
				...base,
				eventId: nextEventId(),
				type: "task.approval_resolved",
				approvalId: intent.approvalId,
				decision: intent.decision,
			});
			statusEvent(status, to);
			if (to === "running") {
				events.push({
					...base,
					eventId: nextEventId(),
					type: "task.turn_bound",
					turnId: intent.turnId as string,
					generation: intent.generation as string,
				});
				activeTurnId = intent.turnId;
				activeGeneration = intent.generation;
			}
			status = to;
			pendingApprovalIds = pendingApprovalIds.filter((id) => id !== intent.approvalId);
			break;
		}
		case "start":
		case "resume": {
			const to = "running";
			assertTransition(status, to, intent);
			// A Task may only run by binding an existing Turn; it owns no model loop.
			if (!intent.turnId || !intent.generation) {
				throw new RuntimeTaskError(
					RUNTIME_TASK_ERROR_CODES.MISSING_TURN_BINDING,
					`${intent.type} requires a turnId and the acquired generation`,
				);
			}
			statusEvent(status, to);
			events.push({
				...base,
				eventId: nextEventId(),
				type: "task.turn_bound",
				turnId: intent.turnId,
				generation: intent.generation,
			});
			status = to;
			activeTurnId = intent.turnId;
			activeGeneration = intent.generation;
			break;
		}
		case "review": {
			const to = reviewDecisionTarget(intent.decision);
			assertTransition(status, to, intent);
			statusEvent(status, to);
			status = to;
			break;
		}
		case "plan":
		case "pause":
		case "submit_review":
		case "fail":
		case "cancel": {
			const to = INTENT_TARGET[intent.type];
			if (to === undefined)
				throw new RuntimeTaskError(
					RUNTIME_TASK_ERROR_CODES.INVALID_TRANSITION,
					`intent "${intent.type}" has no target status`,
				);
			assertTransition(status, to, intent);
			const reason = intent.type === "fail" || intent.type === "cancel" ? intent.reason : undefined;
			statusEvent(status, to, reason);
			status = to;
			break;
		}
	}

	return {
		snapshot: {
			...snapshot,
			status,
			updatedAt: input.at,
			...(activeTurnId === undefined ? {} : { activeTurnId }),
			...(activeGeneration === undefined ? {} : { activeGeneration }),
			artifactIds,
			pendingApprovalIds,
		},
		events,
	};
}

export function createRuntimeTaskSnapshot(input: {
	readonly identity: RuntimeTaskIdentity;
	readonly title?: string;
	readonly at: number;
}): RuntimeTaskSnapshot {
	return {
		schemaVersion: 1,
		identity: input.identity,
		status: "draft",
		...(input.title === undefined ? {} : { title: input.title }),
		createdAt: input.at,
		updatedAt: input.at,
		artifactIds: [],
		pendingApprovalIds: [],
	};
}

/**
 * Rebuilds a Task snapshot from its persisted event log. This is the restart-
 * recovery contract: pending approvals and bound turns must survive replay.
 */
export function rebuildRuntimeTaskSnapshot(events: readonly RuntimeTaskEvent[]): RuntimeTaskSnapshot {
	const [first, ...rest] = events;
	if (!first || first.type !== "task.created") {
		throw new RuntimeTaskError(
			RUNTIME_TASK_ERROR_CODES.EVENT_LOG_INVALID,
			"task event log must start with task.created",
		);
	}
	let snapshot = first.snapshot;
	let lastAt = first.at;
	const seenEventIds = new Set<string>([first.eventId]);
	const invalid = (message: string, details?: Readonly<Record<string, unknown>>): RuntimeTaskError =>
		new RuntimeTaskError(RUNTIME_TASK_ERROR_CODES.EVENT_LOG_INVALID, message, details);
	for (const event of rest) {
		if (event.taskId !== snapshot.identity.taskId) {
			throw invalid("event log mixes task ids", {
				expected: snapshot.identity.taskId,
				actual: event.taskId,
			});
		}
		// 损坏/乱序/重复记录一律 fail closed：不静默归一化为有效快照。
		if (seenEventIds.has(event.eventId)) {
			throw invalid("duplicate eventId in event log", { eventId: event.eventId });
		}
		seenEventIds.add(event.eventId);
		if (event.at < lastAt) {
			throw invalid("event log is not ordered by `at`", { previousAt: lastAt, actual: event.at });
		}
		lastAt = event.at;
		switch (event.type) {
			case "task.status_changed": {
				if (event.from !== snapshot.status) {
					throw invalid("status_changed.from does not match current status", {
						expected: snapshot.status,
						actual: event.from,
					});
				}
				if (!canTransitionRuntimeTask(event.from, event.to)) {
					throw invalid("event log contains an unreachable transition", {
						from: event.from,
						to: event.to,
					});
				}
				snapshot = { ...snapshot, status: event.to, updatedAt: event.at };
				break;
			}
			case "task.turn_bound":
				snapshot = {
					...snapshot,
					activeTurnId: event.turnId,
					activeGeneration: event.generation,
					updatedAt: event.at,
				};
				break;
			case "task.artifact_attached":
				if (snapshot.artifactIds.includes(event.artifactId)) {
					throw invalid("duplicate artifact_attached in event log", { artifactId: event.artifactId });
				}
				snapshot = {
					...snapshot,
					artifactIds: [...snapshot.artifactIds, event.artifactId],
					updatedAt: event.at,
				};
				break;
			case "task.approval_requested":
				if (snapshot.pendingApprovalIds.includes(event.approvalId)) {
					throw invalid("duplicate approval_requested in event log", { approvalId: event.approvalId });
				}
				snapshot = {
					...snapshot,
					pendingApprovalIds: [...snapshot.pendingApprovalIds, event.approvalId],
					updatedAt: event.at,
				};
				break;
			case "task.approval_resolved":
				if (!snapshot.pendingApprovalIds.includes(event.approvalId)) {
					throw invalid("approval_resolved references a non-pending approval", {
						approvalId: event.approvalId,
					});
				}
				snapshot = {
					...snapshot,
					pendingApprovalIds: snapshot.pendingApprovalIds.filter((id) => id !== event.approvalId),
					updatedAt: event.at,
				};
				break;
			case "task.created":
				throw invalid("duplicate task.created in log");
		}
	}
	return snapshot;
}

/** Grant validity at `now`: revocation and expiry are evaluated on read. */
export function isPermissionGrantActive(grant: PermissionGrant, now: number): boolean {
	if (grant.revokedAt !== undefined) return false;
	if (grant.expiresAt !== undefined && grant.expiresAt <= now) return false;
	return true;
}

/** Capability check: explicit deny always wins over an allow-listed capability. */
export function permissionGrantAllows(grant: PermissionGrant, capability: string, now: number): boolean {
	if (!isPermissionGrantActive(grant, now)) return false;
	if (grant.deniedCapabilities?.includes(capability)) return false;
	return grant.capabilities.includes(capability);
}

export const ARTIFACT_AVAILABILITY = {
	READY: "ready",
	MISSING: "missing",
} as const;

export type ArtifactAvailability = (typeof ARTIFACT_AVAILABILITY)[keyof typeof ARTIFACT_AVAILABILITY];

export interface ArtifactAvailabilityResult {
	readonly status: ArtifactAvailability;
	readonly descriptor: ArtifactDescriptor;
}

/**
 * Artifact-missing contract: the descriptor survives even when the backing
 * content is gone (it is a rebuildable projection, not the truth source), but
 * materialization reports a stable `missing` outcome instead of fabricating
 * or crashing. `exists` is host-injected; runtime never touches storage here.
 */
export function resolveArtifactAvailability(
	descriptor: ArtifactDescriptor,
	exists: (uri: string) => boolean,
): ArtifactAvailabilityResult {
	if (descriptor.uri !== undefined && !exists(descriptor.uri)) {
		return { status: ARTIFACT_AVAILABILITY.MISSING, descriptor };
	}
	return { status: ARTIFACT_AVAILABILITY.READY, descriptor };
}
