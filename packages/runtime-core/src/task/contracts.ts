/**
 * Product-neutral Task / Artifact / Permission / Approval contracts.
 *
 * These types freeze the planning-stage invariants from
 * `exprot/core-contracts.md` so later vertical slices cannot silently grow a
 * second model loop, a second file truth source, or Renderer-owned approval
 * state:
 *
 * - A Task only binds existing Session/Turn identities; it never executes a
 *   model or a tool itself.
 * - File content is the Artifact truth source; the descriptor is a
 *   rebuildable projection.
 * - Approval is Runtime state and survives process/UI restarts.
 * - `generation` pins an already-acquired Snapshot/Lease identity.
 */

export type RuntimeTaskStatus =
	| "draft"
	| "planning"
	| "awaiting_approval"
	| "running"
	| "paused"
	| "awaiting_review"
	| "completed"
	| "failed"
	| "cancelled"
	| "rejected"
	| "changes_requested";

/** Statuses after which a Task accepts no further transitions. */
export const RUNTIME_TASK_TERMINAL_STATUSES = ["completed", "failed", "cancelled", "rejected"] as const;

export interface RuntimeTaskIdentity {
	readonly taskId: string;
	readonly rootSessionId: string;
	/** Immutable Snapshot/Lease generation captured when the Task was created. */
	readonly generation: string;
}

export interface RuntimeTaskSnapshot {
	readonly schemaVersion: 1;
	readonly identity: RuntimeTaskIdentity;
	readonly status: RuntimeTaskStatus;
	readonly title?: string;
	readonly createdAt: number;
	readonly updatedAt: number;
	/** Turn of `identity.rootSessionId` the current activity is bound to. */
	readonly activeTurnId?: string;
	readonly artifactIds: readonly string[];
	readonly pendingApprovalIds: readonly string[];
}

/**
 * Replayable Task event log. Runtime-owned; UI must rebuild from these events
 * rather than holding the terminal state in memory.
 */
export type RuntimeTaskEvent =
	| RuntimeTaskCreatedEvent
	| RuntimeTaskStatusChangedEvent
	| RuntimeTaskTurnBoundEvent
	| RuntimeTaskArtifactAttachedEvent
	| RuntimeTaskApprovalRequestedEvent
	| RuntimeTaskApprovalResolvedEvent;

interface RuntimeTaskEventBase {
	readonly schemaVersion: 1;
	readonly taskId: string;
	readonly eventId: string;
	readonly at: number;
}

export interface RuntimeTaskCreatedEvent extends RuntimeTaskEventBase {
	readonly type: "task.created";
	readonly snapshot: RuntimeTaskSnapshot;
}

export interface RuntimeTaskStatusChangedEvent extends RuntimeTaskEventBase {
	readonly type: "task.status_changed";
	readonly from: RuntimeTaskStatus;
	readonly to: RuntimeTaskStatus;
	readonly reason?: string;
}

export interface RuntimeTaskTurnBoundEvent extends RuntimeTaskEventBase {
	readonly type: "task.turn_bound";
	readonly turnId: string;
}

export interface RuntimeTaskArtifactAttachedEvent extends RuntimeTaskEventBase {
	readonly type: "task.artifact_attached";
	readonly artifactId: string;
}

export interface RuntimeTaskApprovalRequestedEvent extends RuntimeTaskEventBase {
	readonly type: "task.approval_requested";
	readonly approvalId: string;
}

export interface RuntimeTaskApprovalResolvedEvent extends RuntimeTaskEventBase {
	readonly type: "task.approval_resolved";
	readonly approvalId: string;
	readonly decision: ApprovalDecision;
}

export type ArtifactKind =
	| "document"
	| "dataset"
	| "analysis"
	| "code-change"
	| "execution-result"
	| "research-evidence"
	| "bundle";

export type ArtifactStatus = "draft" | "generated" | "modified" | "validated" | "accepted" | "rejected";

/**
 * Rebuildable projection of Artifact content. The descriptor carries only
 * facts needed for indexing and routing to a renderer; renderable payloads
 * never flow through model-visible `content`.
 */
export interface ArtifactDescriptor {
	readonly schemaVersion: 1;
	readonly artifactId: string;
	readonly kind: ArtifactKind;
	readonly status: ArtifactStatus;
	readonly title: string;
	readonly uri?: string;
	/** Monotonically increasing; history facts are never overwritten in place. */
	readonly version: number;
	readonly sourceTaskId?: string;
	readonly sourceSessionId: string;
	readonly sourceTurnId?: string;
	readonly contentType?: string;
	readonly checksum?: string;
	readonly rendererType?: string;
	readonly createdAt: number;
	readonly updatedAt: number;
}

export type ToolRiskLevel = "L0" | "L1" | "L2" | "L3" | "L4";

export type ToolExecutionClass = "parallel-safe" | "exclusive";

/**
 * Registry-provided capability description. Risk may be raised by arguments
 * or target resources, never lowered by the model; whether a level requires
 * approval is a Policy decision, not part of this descriptor.
 */
export interface ToolRiskDescriptor {
	readonly defaultLevel: ToolRiskLevel;
	readonly executionClass: ToolExecutionClass;
	readonly irreversible: boolean;
	readonly externalSideEffect: boolean;
	readonly requiredScopes: readonly string[];
}

export type PermissionTrustScope = "session" | "project";

export type PermissionGrantSource = "user" | "project-policy" | "built-in";

/**
 * Host/platform trust record. Project-scope grants only live in local
 * trust storage (e.g. `.vetta-local/trust.json`) and must never be written
 * into shared `.vetta/` data or escalate to global trust implicitly.
 */
export interface PermissionGrant {
	readonly schemaVersion: 1;
	readonly grantId: string;
	readonly scope: PermissionTrustScope;
	/** Required iff `scope === "project"`; forbidden for session grants. */
	readonly projectRoot?: string;
	readonly capabilities: readonly string[];
	readonly deniedCapabilities?: readonly string[];
	readonly source: PermissionGrantSource;
	readonly version: string;
	readonly issuedAt: number;
	readonly expiresAt?: number;
	readonly revokedAt?: number;
}

export type ApprovalDecision = "approve" | "approve_once" | "deny" | "edit";

/**
 * Runtime-owned approval record. The pending request must survive Renderer
 * teardown and process restart; the UI is only a projection of this state.
 */
export interface ApprovalRequest {
	readonly schemaVersion: 1;
	readonly approvalId: string;
	readonly taskId: string;
	readonly sessionId: string;
	readonly turnId: string;
	readonly toolName: string;
	readonly risk: ToolRiskDescriptor;
	readonly summary: string;
	readonly inputPreview: unknown;
	readonly affectedResources: readonly string[];
	readonly createdAt: number;
	readonly expiresAt?: number;
}
