// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	createRuntimeTaskSnapshot,
	planTaskEventsForTurnOutcome,
	planTaskEventsForTurnStart,
	type RuntimeTaskIdentity,
	type RuntimeTaskSnapshot,
} from "../../src/task/index.js";

const identity: RuntimeTaskIdentity = {
	taskId: "task-1",
	rootSessionId: "session-1",
};

function snapshotAt(status: RuntimeTaskSnapshot["status"], activeTurnId?: string): RuntimeTaskSnapshot {
	const base = createRuntimeTaskSnapshot({ identity, title: "整理文档", at: 100 });
	return { ...base, status, ...(activeTurnId ? { activeTurnId } : {}) };
}

describe("planTaskEventsForTurnStart", () => {
	it("把 planning 状态的 Task 绑定到新 Turn（start）", () => {
		const batches = planTaskEventsForTurnStart([snapshotAt("planning")], {
			turnId: "turn-9",
			generation: "gen-9",
			at: 200,
		});
		expect(batches).toHaveLength(1);
		const types = batches[0].events.map((event) => event.type);
		expect(types).toEqual(["task.status_changed", "task.turn_bound"]);
		if (batches[0].events[0].type !== "task.status_changed") throw new Error("unreachable");
		expect(batches[0].events[0].from).toBe("planning");
		expect(batches[0].events[0].to).toBe("running");
	});

	it("把 paused 状态的 Task 恢复到新 Turn（resume）", () => {
		const batches = planTaskEventsForTurnStart([snapshotAt("paused", "turn-1")], {
			turnId: "turn-9",
			generation: "gen-9",
			at: 200,
		});
		expect(batches).toHaveLength(1);
		if (batches[0].events[1].type !== "task.turn_bound") throw new Error("unreachable");
		expect(batches[0].events[1].turnId).toBe("turn-9");
		expect(batches[0].events[1].generation).toBe("gen-9");
	});

	it("awaiting_approval 的 Task 在新 Turn 自动重绑（重启恢复路径）", () => {
		const batches = planTaskEventsForTurnStart([snapshotAt("awaiting_approval", "turn-0")], {
			turnId: "turn-9",
			generation: "gen-9",
			at: 200,
		});
		expect(batches).toHaveLength(1);
		if (batches[0].events[0].type !== "task.status_changed") throw new Error("unreachable");
		expect(batches[0].events[0].to).toBe("running");
	});

	it("draft、awaiting_review、终态与运行中 Task 不自动绑定", () => {
		const statuses = [
			"draft",
			"running",
			"awaiting_review",
			"completed",
			"failed",
			"cancelled",
			"rejected",
			"changes_requested",
		] as const;
		for (const status of statuses) {
			expect(
				planTaskEventsForTurnStart([snapshotAt(status, "turn-1")], {
					turnId: "turn-9",
					generation: "gen-9",
					at: 200,
				}),
			).toEqual([]);
		}
	});
});

describe("planTaskEventsForTurnOutcome", () => {
	it("Turn 完成把绑定该 Turn 的运行中 Task 推进到 awaiting_review", () => {
		const batches = planTaskEventsForTurnOutcome([snapshotAt("running", "turn-9")], {
			turnId: "turn-9",
			outcome: "completed",
			at: 300,
		});
		expect(batches).toHaveLength(1);
		const event = batches[0].events[0];
		if (event.type !== "task.status_changed") throw new Error("unreachable");
		expect(event.from).toBe("running");
		expect(event.to).toBe("awaiting_review");
	});

	it("Turn 失败/取消让绑定该 Turn 的 Task 进入对应终态", () => {
		for (const outcome of ["failed", "cancelled"] as const) {
			const batches = planTaskEventsForTurnOutcome([snapshotAt("running", "turn-9")], {
				turnId: "turn-9",
				outcome,
				at: 300,
				reason: "provider-error",
			});
			expect(batches).toHaveLength(1);
			const event = batches[0].events[0];
			if (event.type !== "task.status_changed") throw new Error("unreachable");
			expect(event.to).toBe(outcome === "failed" ? "failed" : "cancelled");
			expect(event.reason).toBe("provider-error");
		}
	});

	it("只推进绑定到该 Turn 的运行中 Task；其他 Turn 的运行中 Task 不受影响", () => {
		const batches = planTaskEventsForTurnOutcome([snapshotAt("running", "turn-8")], {
			turnId: "turn-9",
			outcome: "completed",
			at: 300,
		});
		expect(batches).toEqual([]);
	});

	it("paused 的 Task 不随 Turn 终态推进，等待用户显式恢复", () => {
		const batches = planTaskEventsForTurnOutcome([snapshotAt("paused", "turn-9")], {
			turnId: "turn-9",
			outcome: "cancelled",
			at: 300,
		});
		expect(batches).toEqual([]);
	});
});
