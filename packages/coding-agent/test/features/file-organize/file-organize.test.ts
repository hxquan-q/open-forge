// Copyright The Open Forge contributors.
import type { RuntimeToolExecutionRequest } from "@vetta/runtime-core/kernel";
import { describe, expect, it } from "vitest";
import {
	FILE_ORGANIZE_TOOL_NAME,
	type FileOrganizeOutcome,
	readFileOrganizePlan,
} from "../../../src/features/file-organize/contracts.js";
import { createFileOrganizeTool } from "../../../src/features/file-organize/organize-files-tool.js";

function toolWith(outcome: FileOrganizeOutcome | undefined) {
	return createFileOrganizeTool({
		invoke: async () => outcome,
	});
}

function requestFor(input: unknown): RuntimeToolExecutionRequest<never> {
	return {
		sessionId: "session-1",
		turnId: "turn-1",
		toolCallId: "call-1",
		input: input as never,
		signal: new AbortController().signal,
	};
}

const PLAN = {
	operations: [
		{ type: "rename", from: "raw/IMG_001.jpg", to: "2024/01-合影.jpg", reason: "合影" },
		{ type: "move", from: "raw/notes.txt", to: "docs/notes.txt" },
	],
};

describe("readFileOrganizePlan", () => {
	it("合法计划通过收窄；from === to、空路径、未知类型拒绝", () => {
		expect(readFileOrganizePlan(PLAN)?.operations).toHaveLength(2);
		expect(readFileOrganizePlan({ operations: [{ type: "rename", from: "a", to: "a" }] })).toBeUndefined();
		expect(readFileOrganizePlan({ operations: [{ type: "rename", from: "", to: "b" }] })).toBeUndefined();
		expect(readFileOrganizePlan({ operations: [{ type: "delete", from: "a", to: "b" }] })).toBeUndefined();
		expect(readFileOrganizePlan({ operations: [] })).toBeUndefined();
		expect(readFileOrganizePlan(undefined)).toBeUndefined();
	});
});

describe("organize_files tool", () => {
	it("确认后逐文件结果进入模型可见输出", async () => {
		const tool = toolWith({
			confirmed: true,
			items: [
				{ from: "raw/IMG_001.jpg", to: "2024/01-合影.jpg", status: "renamed" },
				{ from: "raw/notes.txt", to: "docs/notes.txt", status: "skipped-target-exists" },
			],
		});
		const result = await tool.execute(requestFor(PLAN));
		expect(result.isError).toBeFalsy();
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("renamed: 1");
		expect(text).toContain("skipped-target-exists: 1");
		expect(text).toContain("raw/IMG_001.jpg -> 2024/01-合影.jpg");
	});

	it("用户拒绝时明确说明未写入任何文件", async () => {
		const tool = toolWith({ confirmed: false, items: [] });
		const result = await tool.execute(requestFor(PLAN));
		const text = result.content[0]?.type === "text" ? result.content[0].text : "";
		expect(text).toContain("rejected");
		expect(result.isError).toBeFalsy();
	});

	it("宿主端口不可用时返回错误而非假装成功", async () => {
		const tool = toolWith(undefined);
		const result = await tool.execute(requestFor(PLAN));
		expect(result.isError).toBe(true);
	});

	it("名称与输入 schema 固定，计划在 validateInput 处 fail closed", () => {
		const tool = toolWith(undefined);
		expect(tool.name).toBe(FILE_ORGANIZE_TOOL_NAME);
		expect(() => tool.validateInput?.({ operations: [{ type: "rename", from: "a", to: "a" }] })).toThrow();
	});
});
