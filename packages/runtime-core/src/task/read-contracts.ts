// Copyright The Open Forge contributors.
import type {
	ApprovalDecision,
	ApprovalRequest,
	ArtifactDescriptor,
	ArtifactKind,
	ArtifactStatus,
	PermissionGrant,
	PermissionGrantSource,
	PermissionTrustScope,
	RuntimeTaskEvent,
	RuntimeTaskIdentity,
	RuntimeTaskSnapshot,
	RuntimeTaskStatus,
	ToolExecutionClass,
	ToolRiskDescriptor,
	ToolRiskLevel,
} from "./contracts.js";
import { ARTIFACT_KINDS } from "./contracts.js";

/**
 * Boundary narrowing for persisted/untrusted Task contracts. Mirrors
 * `readRuntimeFailure`: return `undefined` for anything that does not satisfy
 * the contract instead of throwing, so recovery paths can skip corrupt
 * records without aborting the whole restore.
 */

const TASK_STATUSES: readonly RuntimeTaskStatus[] = [
	"draft",
	"planning",
	"awaiting_approval",
	"running",
	"paused",
	"awaiting_review",
	"completed",
	"failed",
	"cancelled",
	"rejected",
	"changes_requested",
];

const ARTIFACT_STATUSES: readonly ArtifactStatus[] = [
	"draft",
	"generated",
	"modified",
	"validated",
	"accepted",
	"rejected",
];

const TOOL_RISK_LEVELS: readonly ToolRiskLevel[] = ["L0", "L1", "L2", "L3", "L4"];
const TOOL_EXECUTION_CLASSES: readonly ToolExecutionClass[] = ["parallel-safe", "exclusive"];
const TRUST_SCOPES: readonly PermissionTrustScope[] = ["session", "project"];
const GRANT_SOURCES: readonly PermissionGrantSource[] = ["user", "project-policy", "built-in"];
const APPROVAL_DECISIONS: readonly ApprovalDecision[] = ["approve", "approve_once", "deny", "edit"];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function optionalString(value: unknown): value is string | undefined {
	return value === undefined || typeof value === "string";
}

function optionalNumber(value: unknown): value is number | undefined {
	return value === undefined || typeof value === "number";
}

function readIdentity(value: unknown): RuntimeTaskIdentity | undefined {
	if (!isRecord(value)) return undefined;
	if (typeof value.taskId !== "string" || typeof value.rootSessionId !== "string") {
		return undefined;
	}
	// 旧记录里 identity 可能仍带 generation 字段；generation 已由 task.turn_bound
	// 逐次承载，读取时忽略遗留字段而不是拒绝整条记录。
	return { taskId: value.taskId, rootSessionId: value.rootSessionId };
}

// 未知 schemaVersion 一律 fail closed：不把未来/损坏版本的记录静默归一化为 v1。
function isCurrentSchemaVersion(value: Record<string, unknown>): boolean {
	return value.schemaVersion === 1;
}

export function readRuntimeTaskSnapshot(value: unknown): RuntimeTaskSnapshot | undefined {
	if (!isRecord(value) || !isCurrentSchemaVersion(value)) return undefined;
	const identity = readIdentity(value.identity);
	if (
		!identity ||
		typeof value.status !== "string" ||
		!TASK_STATUSES.includes(value.status as RuntimeTaskStatus) ||
		typeof value.createdAt !== "number" ||
		typeof value.updatedAt !== "number" ||
		!isStringArray(value.artifactIds) ||
		!isStringArray(value.pendingApprovalIds) ||
		!optionalString(value.title) ||
		!optionalString(value.activeTurnId) ||
		!optionalString(value.activeGeneration)
	) {
		return undefined;
	}
	return {
		schemaVersion: 1,
		identity,
		status: value.status as RuntimeTaskStatus,
		...(value.title === undefined ? {} : { title: value.title }),
		createdAt: value.createdAt,
		updatedAt: value.updatedAt,
		...(value.activeTurnId === undefined ? {} : { activeTurnId: value.activeTurnId }),
		...(value.activeGeneration === undefined ? {} : { activeGeneration: value.activeGeneration }),
		artifactIds: value.artifactIds,
		pendingApprovalIds: value.pendingApprovalIds,
	};
}

export function readRuntimeTaskEvent(value: unknown): RuntimeTaskEvent | undefined {
	if (!isRecord(value) || !isCurrentSchemaVersion(value)) return undefined;
	if (typeof value.taskId !== "string" || typeof value.eventId !== "string" || typeof value.at !== "number") {
		return undefined;
	}
	const base = { schemaVersion: 1 as const, taskId: value.taskId, eventId: value.eventId, at: value.at };
	switch (value.type) {
		case "task.created": {
			const snapshot = readRuntimeTaskSnapshot(value.snapshot);
			return snapshot ? { ...base, type: "task.created", snapshot } : undefined;
		}
		case "task.status_changed": {
			if (
				typeof value.from !== "string" ||
				typeof value.to !== "string" ||
				!TASK_STATUSES.includes(value.from as RuntimeTaskStatus) ||
				!TASK_STATUSES.includes(value.to as RuntimeTaskStatus) ||
				!optionalString(value.reason)
			) {
				return undefined;
			}
			return {
				...base,
				type: "task.status_changed",
				from: value.from as RuntimeTaskStatus,
				to: value.to as RuntimeTaskStatus,
				...(value.reason === undefined ? {} : { reason: value.reason }),
			};
		}
		case "task.turn_bound":
			return typeof value.turnId === "string" && typeof value.generation === "string"
				? { ...base, type: "task.turn_bound", turnId: value.turnId, generation: value.generation }
				: undefined;
		case "task.artifact_attached":
			return typeof value.artifactId === "string"
				? { ...base, type: "task.artifact_attached", artifactId: value.artifactId }
				: undefined;
		case "task.approval_requested":
			return typeof value.approvalId === "string"
				? { ...base, type: "task.approval_requested", approvalId: value.approvalId }
				: undefined;
		case "task.approval_resolved":
			return typeof value.approvalId === "string" &&
				typeof value.decision === "string" &&
				APPROVAL_DECISIONS.includes(value.decision as ApprovalDecision)
				? {
						...base,
						type: "task.approval_resolved",
						approvalId: value.approvalId,
						decision: value.decision as ApprovalDecision,
					}
				: undefined;
		default:
			return undefined;
	}
}

export function readToolRiskDescriptor(value: unknown): ToolRiskDescriptor | undefined {
	if (!isRecord(value)) return undefined;
	if (
		typeof value.defaultLevel !== "string" ||
		!TOOL_RISK_LEVELS.includes(value.defaultLevel as ToolRiskLevel) ||
		typeof value.executionClass !== "string" ||
		!TOOL_EXECUTION_CLASSES.includes(value.executionClass as ToolExecutionClass) ||
		typeof value.irreversible !== "boolean" ||
		typeof value.externalSideEffect !== "boolean" ||
		!isStringArray(value.requiredScopes)
	) {
		return undefined;
	}
	return {
		defaultLevel: value.defaultLevel as ToolRiskLevel,
		executionClass: value.executionClass as ToolExecutionClass,
		irreversible: value.irreversible,
		externalSideEffect: value.externalSideEffect,
		requiredScopes: value.requiredScopes,
	};
}

export function readArtifactDescriptor(value: unknown): ArtifactDescriptor | undefined {
	if (!isRecord(value) || !isCurrentSchemaVersion(value)) return undefined;
	if (
		typeof value.artifactId !== "string" ||
		typeof value.kind !== "string" ||
		!ARTIFACT_KINDS.includes(value.kind as ArtifactKind) ||
		typeof value.status !== "string" ||
		!ARTIFACT_STATUSES.includes(value.status as ArtifactStatus) ||
		typeof value.title !== "string" ||
		typeof value.version !== "number" ||
		typeof value.sourceSessionId !== "string" ||
		typeof value.createdAt !== "number" ||
		typeof value.updatedAt !== "number" ||
		!optionalString(value.uri) ||
		!optionalString(value.sourceTaskId) ||
		!optionalString(value.sourceTurnId) ||
		!optionalString(value.contentType) ||
		!optionalString(value.checksum) ||
		!optionalString(value.rendererType)
	) {
		return undefined;
	}
	return {
		schemaVersion: 1,
		artifactId: value.artifactId,
		kind: value.kind as ArtifactKind,
		status: value.status as ArtifactStatus,
		title: value.title,
		...(value.uri === undefined ? {} : { uri: value.uri }),
		version: value.version,
		...(value.sourceTaskId === undefined ? {} : { sourceTaskId: value.sourceTaskId }),
		sourceSessionId: value.sourceSessionId,
		...(value.sourceTurnId === undefined ? {} : { sourceTurnId: value.sourceTurnId }),
		...(value.contentType === undefined ? {} : { contentType: value.contentType }),
		...(value.checksum === undefined ? {} : { checksum: value.checksum }),
		...(value.rendererType === undefined ? {} : { rendererType: value.rendererType }),
		createdAt: value.createdAt,
		updatedAt: value.updatedAt,
	};
}

export function readPermissionGrant(value: unknown): PermissionGrant | undefined {
	if (!isRecord(value) || !isCurrentSchemaVersion(value)) return undefined;
	if (
		typeof value.grantId !== "string" ||
		typeof value.scope !== "string" ||
		!TRUST_SCOPES.includes(value.scope as PermissionTrustScope) ||
		!isStringArray(value.capabilities) ||
		(value.deniedCapabilities !== undefined && !isStringArray(value.deniedCapabilities)) ||
		typeof value.source !== "string" ||
		!GRANT_SOURCES.includes(value.source as PermissionGrantSource) ||
		typeof value.version !== "string" ||
		typeof value.issuedAt !== "number" ||
		!optionalNumber(value.expiresAt) ||
		!optionalNumber(value.revokedAt) ||
		!optionalString(value.projectRoot)
	) {
		return undefined;
	}
	// Project trust must carry its root; a session grant must not smuggle one in.
	if (value.scope === "project" && typeof value.projectRoot !== "string") return undefined;
	if (value.scope === "session" && value.projectRoot !== undefined) return undefined;
	return {
		schemaVersion: 1,
		grantId: value.grantId,
		scope: value.scope as PermissionTrustScope,
		...(value.projectRoot === undefined ? {} : { projectRoot: value.projectRoot }),
		capabilities: value.capabilities,
		...(value.deniedCapabilities === undefined ? {} : { deniedCapabilities: value.deniedCapabilities }),
		source: value.source as PermissionGrantSource,
		version: value.version,
		issuedAt: value.issuedAt,
		...(value.expiresAt === undefined ? {} : { expiresAt: value.expiresAt }),
		...(value.revokedAt === undefined ? {} : { revokedAt: value.revokedAt }),
	};
}

export function readApprovalRequest(value: unknown): ApprovalRequest | undefined {
	if (!isRecord(value) || !isCurrentSchemaVersion(value)) return undefined;
	const risk = readToolRiskDescriptor(value.risk);
	if (
		!risk ||
		typeof value.approvalId !== "string" ||
		typeof value.taskId !== "string" ||
		typeof value.sessionId !== "string" ||
		typeof value.turnId !== "string" ||
		typeof value.toolName !== "string" ||
		typeof value.summary !== "string" ||
		!isStringArray(value.affectedResources) ||
		typeof value.createdAt !== "number" ||
		!optionalNumber(value.expiresAt)
	) {
		return undefined;
	}
	return {
		schemaVersion: 1,
		approvalId: value.approvalId,
		taskId: value.taskId,
		sessionId: value.sessionId,
		turnId: value.turnId,
		toolName: value.toolName,
		risk,
		summary: value.summary,
		inputPreview: value.inputPreview,
		affectedResources: value.affectedResources,
		createdAt: value.createdAt,
		...(value.expiresAt === undefined ? {} : { expiresAt: value.expiresAt }),
	};
}
