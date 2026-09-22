import type { RuntimeTaskEvent, RuntimeTaskSnapshot } from "./contracts.js";
import { canTransitionRuntimeTask, transitionRuntimeTask } from "./state-machine.js";

/**
 * Turn 生命周期与 Task 状态机的绑定规则。
 *
 * Task 不执行模型也不开启 Turn；这里只在 Turn 事实发生的同一事务里推导
 * Task 应当发生的转换，让「绑定既有 Session/Turn」由 Kernel 单点完成，
 * 宿主不再各自监听事件流去驱动 Task。
 */

export interface TaskEventBatch {
	readonly taskId: string;
	readonly events: readonly RuntimeTaskEvent[];
}

export interface TaskTurnBindingInput {
	readonly turnId: string;
	readonly at: number;
}

/**
 * Turn 开始时把处于 `planning` / `paused` 的 Task 绑定到该 Turn（→ `running`）。
 * `draft` 等待显式 `plan`，`changes_requested` 等待用户裁决，都不自动推进。
 */
export function planTaskEventsForTurnStart(
	tasks: readonly RuntimeTaskSnapshot[],
	input: TaskTurnBindingInput,
): readonly TaskEventBatch[] {
	const batches: TaskEventBatch[] = [];
	for (const snapshot of tasks) {
		if (!canTransitionRuntimeTask(snapshot.status, "running")) continue;
		if (snapshot.status !== "planning" && snapshot.status !== "paused") continue;
		const { events } = transitionRuntimeTask(snapshot, {
			eventId: `${input.turnId}:task:${snapshot.identity.taskId}:start`,
			at: input.at,
			intent: { type: snapshot.status === "paused" ? "resume" : "start", turnId: input.turnId },
		});
		batches.push({ taskId: snapshot.identity.taskId, events });
	}
	return batches;
}

export type TaskTurnOutcome = "completed" | "failed" | "cancelled";

/**
 * Turn 终态时推进绑定到该 Turn 的运行中 Task：
 * 完成 → `awaiting_review`（等待 Task Review），失败/取消进入对应终态。
 * 其他状态（已暂停、等待审批）不受 Turn 终态影响，留给用户显式驱动。
 */
export function planTaskEventsForTurnOutcome(
	tasks: readonly RuntimeTaskSnapshot[],
	input: {
		readonly turnId: string;
		readonly outcome: TaskTurnOutcome;
		readonly at: number;
		readonly reason?: string;
	},
): readonly TaskEventBatch[] {
	const batches: TaskEventBatch[] = [];
	for (const snapshot of tasks) {
		if (snapshot.status !== "running" || snapshot.activeTurnId !== input.turnId) continue;
		const intent =
			input.outcome === "completed"
				? ({ type: "submit_review" } as const)
				: input.outcome === "failed"
					? ({ type: "fail", reason: input.reason } as const)
					: ({ type: "cancel", reason: input.reason } as const);
		const { events } = transitionRuntimeTask(snapshot, {
			eventId: `${input.turnId}:task:${snapshot.identity.taskId}:${input.outcome}`,
			at: input.at,
			intent,
		});
		batches.push({ taskId: snapshot.identity.taskId, events });
	}
	return batches;
}
