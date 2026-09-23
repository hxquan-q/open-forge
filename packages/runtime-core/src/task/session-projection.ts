import type {
	ApprovalDecision,
	ApprovalRequest,
	ArtifactDescriptor,
	RuntimeTaskEvent,
	RuntimeTaskSnapshot,
} from "./contracts.js";
import { readApprovalRequest, readArtifactDescriptor, readRuntimeTaskEvent } from "./read-contracts.js";
import { rebuildRuntimeTaskSnapshot } from "./state-machine.js";

/**
 * 会话级 Task/Artifact 事实 → 可展示投影。
 *
 * 输入是持久化事件流里的结构性子集（`task.lifecycle.recorded` /
 * `artifact.descriptor.recorded`）；这里用 `read*` 收窄不可信载荷，再按
 * `rebuildRuntimeTaskSnapshot` 的重放合同收敛。单个 Task 的事件序损坏时
 * 跳过该 Task，而不是让整个会话的 Task 投影失败。
 */

/** 事件流中承载 Task 事实的结构性形状；持久化边界校验后由此收窄。 */
export interface TaskLifecycleFactEvent {
	readonly type: "task.lifecycle.recorded";
	readonly sessionId: string;
	readonly task: RuntimeTaskEvent;
	readonly timestamp: number;
}

/** 事件流中承载 Artifact descriptor 事实的结构性形状。 */
export interface ArtifactDescriptorFactEvent {
	readonly type: "artifact.descriptor.recorded";
	readonly sessionId: string;
	readonly artifact: ArtifactDescriptor;
	readonly timestamp: number;
}

/** 事件流中承载 Approval 请求事实的结构性形状。 */
export interface ApprovalRequestedFactEvent {
	readonly type: "approval.requested.recorded";
	readonly sessionId: string;
	readonly turnId?: string;
	readonly request: ApprovalRequest;
	readonly timestamp: number;
}

/** 事件流中承载 Approval 决策事实的结构性形状。 */
export interface ApprovalDecisionFactEvent {
	readonly type: "approval.decision.recorded";
	readonly sessionId: string;
	readonly turnId?: string;
	readonly approvalId: string;
	readonly decision: ApprovalDecision;
	readonly timestamp: number;
}

export type RuntimeTaskFactEvent =
	| TaskLifecycleFactEvent
	| ArtifactDescriptorFactEvent
	| ApprovalRequestedFactEvent
	| ApprovalDecisionFactEvent;

export interface RuntimeSessionTaskState {
	/** 按创建顺序重放的 Task 快照。 */
	readonly tasks: readonly RuntimeTaskSnapshot[];
	/** 每个 artifactId 的最新 descriptor（version 单调递增，取最后一条事实）。 */
	readonly artifacts: readonly ArtifactDescriptor[];
	/** 已请求且尚无决策记录的审批（重启恢复口径；是否仍有效由宿主重校验）。 */
	readonly pendingApprovals: readonly ApprovalRequest[];
	/** 决策历史（approvalId → 最终决策），供审计与「编辑后重新申请」核对。 */
	readonly approvalDecisions: ReadonlyMap<string, ApprovalDecision>;
}

export function isRuntimeTaskFactEvent(event: unknown): event is RuntimeTaskFactEvent {
	if (typeof event !== "object" || event === null) return false;
	const candidate = event as { type?: unknown };
	return (
		candidate.type === "task.lifecycle.recorded" ||
		candidate.type === "artifact.descriptor.recorded" ||
		candidate.type === "approval.requested.recorded" ||
		candidate.type === "approval.decision.recorded"
	);
}

/** 从事件流收集 Task/Artifact 事实（未收窄的原始载荷原样返回，供上层 `read*` 校验）。 */
export function collectRuntimeTaskFacts(events: readonly unknown[]): readonly RuntimeTaskFactEvent[] {
	return events.filter(isRuntimeTaskFactEvent) as readonly RuntimeTaskFactEvent[];
}

export function projectRuntimeSessionTaskState(events: readonly unknown[]): RuntimeSessionTaskState {
	const taskEventsById = new Map<string, RuntimeTaskEvent[]>();
	const creationOrder: string[] = [];
	const artifactsById = new Map<string, ArtifactDescriptor>();
	const approvalsById = new Map<string, ApprovalRequest>();
	const decisionsById = new Map<string, ApprovalDecision>();

	for (const fact of collectRuntimeTaskFacts(events)) {
		if (fact.type === "task.lifecycle.recorded") {
			const taskEvent = readRuntimeTaskEvent(fact.task);
			if (!taskEvent) continue;
			const existing = taskEventsById.get(taskEvent.taskId);
			if (existing) {
				existing.push(taskEvent);
			} else {
				taskEventsById.set(taskEvent.taskId, [taskEvent]);
				creationOrder.push(taskEvent.taskId);
			}
		} else if (fact.type === "artifact.descriptor.recorded") {
			const descriptor = readArtifactDescriptor(fact.artifact);
			if (!descriptor) continue;
			// 版本单调：乱序/迟到的低版本事实不得覆盖已投影的高版本 descriptor。
			const existing = artifactsById.get(descriptor.artifactId);
			if (existing !== undefined && existing.version >= descriptor.version) continue;
			artifactsById.set(descriptor.artifactId, descriptor);
		} else if (fact.type === "approval.requested.recorded") {
			const request = readApprovalRequest(fact.request);
			if (!request) continue;
			approvalsById.set(request.approvalId, request);
		} else {
			decisionsById.set(fact.approvalId, fact.decision);
		}
	}

	const tasks: RuntimeTaskSnapshot[] = [];
	for (const taskId of creationOrder) {
		const taskEvents = taskEventsById.get(taskId);
		if (!taskEvents) continue;
		try {
			tasks.push(rebuildRuntimeTaskSnapshot(taskEvents));
		} catch {
			// 单个 Task 事件序损坏（缺 task.created / 混入他人事件）时跳过，
			// 不阻断会话其余 Task 与消息的投影。
		}
	}

	const pendingApprovals: ApprovalRequest[] = [];
	for (const request of approvalsById.values()) {
		if (!decisionsById.has(request.approvalId)) pendingApprovals.push(request);
	}

	return {
		tasks,
		artifacts: [...artifactsById.values()],
		pendingApprovals,
		approvalDecisions: decisionsById,
	};
}
