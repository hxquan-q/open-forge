// Copyright The Open Forge contributors.
import { describe, expect, it, vi } from "vitest";

// parseCommand 是纯函数；mock 掉领域服务以隔离 electron/runtime 的传递导入。
vi.mock("../task-activity/task-activity-service.js", () => ({
	desktopTaskActivityService: {
		getState: () => ({ tasks: [], artifacts: [] }),
		getArtifactViews: async () => [],
		runCommand: async () => ({ ok: false, code: "unused", message: "unused" }),
	},
}));

import { parseCommand } from "./task.js";

describe("task IPC command parsing", () => {
	it("create 不带标题也合法；title 仅接受字符串", () => {
		expect(parseCommand({ type: "create" })).toEqual({ type: "create" });
		expect(parseCommand({ type: "create", title: "整理材料" })).toEqual({ type: "create", title: "整理材料" });
		expect(parseCommand({ type: "create", title: 42 })).toEqual({ type: "create" });
	});

	it("review 只接受三种裁决；非法 decision 拒绝", () => {
		expect(parseCommand({ type: "review", taskId: "task-1", decision: "approved" })).toEqual({
			type: "review",
			taskId: "task-1",
			decision: "approved",
		});
		expect(parseCommand({ type: "review", taskId: "task-1", decision: "ship-it" })).toBeUndefined();
		expect(parseCommand({ type: "review", decision: "approved" })).toBeUndefined();
	});

	it("attach-artifact 校验 kind 白名单与必填字段", () => {
		const artifact = { kind: "document", title: "纪要", uri: "file:///notes.md" };
		expect(parseCommand({ type: "attach-artifact", taskId: "task-1", artifact })).toEqual({
			type: "attach-artifact",
			taskId: "task-1",
			artifact,
		});
		expect(
			parseCommand({ type: "attach-artifact", taskId: "task-1", artifact: { ...artifact, kind: "virus" } }),
		).toBeUndefined();
		expect(
			parseCommand({ type: "attach-artifact", taskId: "task-1", artifact: { ...artifact, uri: "" } }),
		).toBeUndefined();
	});

	it("未知命令类型拒绝", () => {
		expect(parseCommand({ type: "execute-shell" })).toBeUndefined();
		expect(parseCommand("create")).toBeUndefined();
		expect(parseCommand(null)).toBeUndefined();
	});
});
