// Copyright The Open Forge contributors.
import type {
	ArtifactDescriptor,
	RuntimeSessionTaskState,
	RuntimeTaskEvent,
	RuntimeTaskSnapshot,
} from "@vetta/runtime-core/task";
import { EMPTY_TASK_STATE } from "../store/task-atoms.js";

/**
 * 渲染端 Task 投影折叠器。
 *
 * 事实源在主进程 Runtime（事件日志）；这里只做「事件 → 快照」的增量纯投影，
 * 行为与 `rebuildRuntimeTaskSnapshot` 的重放语义一致：Renderer 不持有最终状态，
 * 任何时刻都能被 `getState` 快照安全合并。
 */

export type TaskFactSessionEvent =
	| { readonly type: "task.lifecycle"; readonly task: RuntimeTaskEvent }
	| { readonly type: "artifact.descriptor"; readonly artifact: ArtifactDescriptor };

function findTaskIndex(state: RuntimeSessionTaskState, taskId: string): number {
	return state.tasks.findIndex((task) => task.identity.taskId === taskId);
}

function replaceTask(state: RuntimeSessionTaskState, snapshot: RuntimeTaskSnapshot): RuntimeSessionTaskState {
	const index = findTaskIndex(state, snapshot.identity.taskId);
	if (index < 0) return { ...state, tasks: [...state.tasks, snapshot] };
	const tasks = [...state.tasks];
	tasks[index] = snapshot;
	return { ...state, tasks };
}

/** 单条事实事件应用到当前投影；未知 Task 的非 created 事件按重放语义忽略。 */
export function applyTaskFactEvent(
	state: RuntimeSessionTaskState,
	event: TaskFactSessionEvent,
): RuntimeSessionTaskState {
	if (event.type === "artifact.descriptor") {
		const index = state.artifacts.findIndex((artifact) => artifact.artifactId === event.artifact.artifactId);
		if (index < 0) return { ...state, artifacts: [...state.artifacts, event.artifact] };
		// 版本单调：迟到的低版本事实不得覆盖已投影的高版本 descriptor。
		if (state.artifacts[index].version >= event.artifact.version) return state;
		const artifacts = [...state.artifacts];
		artifacts[index] = event.artifact;
		return { ...state, artifacts };
	}

	const task = event.task;
	const index = findTaskIndex(state, task.taskId);
	const snapshot = index < 0 ? undefined : state.tasks[index];

	switch (task.type) {
		case "task.created":
			return index < 0 ? { ...state, tasks: [...state.tasks, task.snapshot] } : state;
		case "task.status_changed":
			if (!snapshot) return state;
			return replaceTask(state, { ...snapshot, status: task.to, updatedAt: task.at });
		case "task.turn_bound":
			if (!snapshot) return state;
			return replaceTask(state, {
				...snapshot,
				activeTurnId: task.turnId,
				activeGeneration: task.generation,
				updatedAt: task.at,
			});
		case "task.artifact_attached":
			if (!snapshot || snapshot.artifactIds.includes(task.artifactId)) return state;
			return replaceTask(state, {
				...snapshot,
				artifactIds: [...snapshot.artifactIds, task.artifactId],
				updatedAt: task.at,
			});
		case "task.approval_requested":
			if (!snapshot || snapshot.pendingApprovalIds.includes(task.approvalId)) return state;
			return replaceTask(state, {
				...snapshot,
				pendingApprovalIds: [...snapshot.pendingApprovalIds, task.approvalId],
				updatedAt: task.at,
			});
		case "task.approval_resolved":
			if (!snapshot) return state;
			return replaceTask(state, {
				...snapshot,
				pendingApprovalIds: snapshot.pendingApprovalIds.filter((id) => id !== task.approvalId),
				updatedAt: task.at,
			});
	}
}

/**
 * 用主进程 `getState` 快照补齐当前投影（会话打开与事件竞态时按时间戳取新）：
 * Task 按 `updatedAt` 取较新一方，Artifact 按 `version` 取较高一方。
 */
export function mergeTaskStateSeed(
	current: RuntimeSessionTaskState,
	seed: RuntimeSessionTaskState,
): RuntimeSessionTaskState {
	const tasks = [...current.tasks];
	for (const seedTask of seed.tasks) {
		const index = findTaskIndex(current, seedTask.identity.taskId);
		if (index < 0) {
			tasks.push(seedTask);
			continue;
		}
		if (seedTask.updatedAt >= tasks[index].updatedAt) tasks[index] = seedTask;
	}
	const artifacts = [...current.artifacts];
	for (const seedArtifact of seed.artifacts) {
		const index = artifacts.findIndex((artifact) => artifact.artifactId === seedArtifact.artifactId);
		if (index < 0) {
			artifacts.push(seedArtifact);
			continue;
		}
		if (seedArtifact.version >= artifacts[index].version) artifacts[index] = seedArtifact;
	}
	const approvals = [...current.pendingApprovals];
	for (const seedApproval of seed.pendingApprovals) {
		if (!approvals.some((approval) => approval.approvalId === seedApproval.approvalId)) approvals.push(seedApproval);
	}
	const decisions = new Map([...current.approvalDecisions]);
	for (const [approvalId, decision] of seed.approvalDecisions) {
		if (!decisions.has(approvalId)) decisions.set(approvalId, decision);
	}
	return {
		tasks,
		artifacts,
		pendingApprovals: approvals,
		approvalDecisions: decisions,
	};
}

const inflightTaskStateSeeds = new Map<string, Promise<void>>();

/**
 * 用主进程 `getState` 快照补齐会话投影（重启后历史 Task/Artifact 由此恢复）。
 * 同一 runtime 的并发拉取共享一次 IPC——右栏门槛与面板可能同时挂载，各拉一遍是浪费。
 * 补齐是尽力而为：拉取失败时事件流折叠仍会继续更新投影。
 */
export function seedSessionTaskState(
	runtimeId: string,
	setTaskState: (
		updater: (prev: Map<string, RuntimeSessionTaskState>) => Map<string, RuntimeSessionTaskState>,
	) => void,
): Promise<void> {
	const api = window.vetta?.task;
	if (!api) return Promise.resolve();
	const inflight = inflightTaskStateSeeds.get(runtimeId);
	if (inflight) return inflight;
	const request = api
		.getState(runtimeId)
		.then((state) => {
			setTaskState((prev) => {
				const current = prev.get(runtimeId) ?? EMPTY_TASK_STATE;
				const next = mergeTaskStateSeed(current, state);
				return next === current ? prev : new Map(prev).set(runtimeId, next);
			});
		})
		.catch(() => {
			// 快照补齐是尽力而为：事件流折叠仍会继续更新投影。
		})
		.finally(() => {
			inflightTaskStateSeeds.delete(runtimeId);
		});
	inflightTaskStateSeeds.set(runtimeId, request);
	return request;
}
