// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { selectEventTriggeredTasks } from "./automation-event-select.js";
import type { ScheduledTask } from "./task-storage.js";

function task(partial: Partial<ScheduledTask> & Pick<ScheduledTask, "id" | "trigger">): ScheduledTask {
	return {
		name: partial.name ?? partial.id,
		prompt: "run",
		cron: "0 9 * * *",
		isOnce: false,
		enabled: partial.enabled ?? true,
		cwd: partial.cwd ?? "C:/proj",
		createdAt: 1,
		updatedAt: 1,
		lastRunAt: null,
		lastRunStatus: null,
		...partial,
	};
}

describe("selectEventTriggeredTasks", () => {
	it("matches enabled event tasks for the named host event", () => {
		const tasks = [
			task({ id: "a", trigger: { type: "event", event: "session.created" } }),
			task({ id: "b", trigger: { type: "event", event: "project.opened" } }),
			task({ id: "c", trigger: { type: "cron" }, enabled: true }),
			task({ id: "d", trigger: { type: "event", event: "session.created" }, enabled: false }),
		];
		expect(selectEventTriggeredTasks(tasks, "session.created").map((item) => item.id)).toEqual(["a"]);
	});

	it("scopes by cwd when the event carries a project path", () => {
		const tasks = [
			task({ id: "same", trigger: { type: "event", event: "session.created" }, cwd: "C:/a" }),
			task({ id: "other", trigger: { type: "event", event: "session.created" }, cwd: "C:/b" }),
		];
		expect(selectEventTriggeredTasks(tasks, "session.created", { cwd: "C:/a" }).map((item) => item.id)).toEqual([
			"same",
		]);
	});
});
