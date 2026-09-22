import type { ArtifactDescriptor, RuntimeTaskEvent, RuntimeTaskSnapshot } from "./contracts.js";
import { readArtifactDescriptor, readRuntimeTaskEvent } from "./read-contracts.js";
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

export type RuntimeTaskFactEvent = TaskLifecycleFactEvent | ArtifactDescriptorFactEvent;

export interface RuntimeSessionTaskState {
	/** 按创建顺序重放的 Task 快照。 */
	readonly tasks: readonly RuntimeTaskSnapshot[];
	/** 每个 artifactId 的最新 descriptor（version 单调递增，取最后一条事实）。 */
	readonly artifacts: readonly ArtifactDescriptor[];
}

export function isRuntimeTaskFactEvent(event: unknown): event is RuntimeTaskFactEvent {
	if (typeof event !== "object" || event === null) return false;
	const candidate = event as { type?: unknown };
	return candidate.type === "task.lifecycle.recorded" || candidate.type === "artifact.descriptor.recorded";
}

/** 从事件流收集 Task/Artifact 事实（未收窄的原始载荷原样返回，供上层 `read*` 校验）。 */
export function collectRuntimeTaskFacts(events: readonly unknown[]): readonly RuntimeTaskFactEvent[] {
	return events.filter(isRuntimeTaskFactEvent) as readonly RuntimeTaskFactEvent[];
}

export function projectRuntimeSessionTaskState(events: readonly unknown[]): RuntimeSessionTaskState {
	const taskEventsById = new Map<string, RuntimeTaskEvent[]>();
	const creationOrder: string[] = [];
	const artifactsById = new Map<string, ArtifactDescriptor>();

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
		} else {
			const descriptor = readArtifactDescriptor(fact.artifact);
			if (!descriptor) continue;
			artifactsById.set(descriptor.artifactId, descriptor);
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

	return { tasks, artifacts: [...artifactsById.values()] };
}
