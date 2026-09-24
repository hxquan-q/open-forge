// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { collectSessionChanges, sessionChangeCallsFromTimeline } from "./session-changes";

const editDiff = (path: string): string =>
	[`--- a/${path}`, `+++ b/${path}`, "@@ -1 +1,2 @@", "-old", "+new", "+extra"].join("\n");

describe("collectSessionChanges", () => {
	it("按文件聚合：同文件多次修改只保留最新差异并标注次数", () => {
		const overview = collectSessionChanges([
			{ toolName: "edit_file", args: { file_path: "src/a.ts" }, diff: editDiff("src/a.ts") },
			{ toolName: "edit_file", args: { file_path: "src/b.ts" }, diff: editDiff("src/b.ts") },
			{
				toolName: "edit_file",
				args: { file_path: "src/a.ts" },
				diff: "--- a/src/a.ts\n+++ b/src/a.ts\n@@\n-x\n+y\n",
			},
		]);
		expect(overview.files.map((file) => file.path)).toEqual(["src/a.ts", "src/b.ts"]);
		expect(overview.files[0]).toMatchObject({ added: 1, removed: 1, changes: 2, status: "modified" });
		expect(overview.files[0]?.diff).toContain("+y");
		expect(overview.files[1]).toMatchObject({ added: 2, removed: 1, changes: 1 });
		// 总量按全部变更累计，用于任务级审查。
		expect(overview).toMatchObject({ added: 5, removed: 3 });
	});

	it("缺 diff 或路径的变更被静默跳过", () => {
		const overview = collectSessionChanges([
			{ toolName: "read_file", args: { file_path: "src/a.ts" } },
			{ toolName: "edit_file", args: { file_path: "src/a.ts" }, diff: "   " },
			{ toolName: "edit_file", args: {}, diff: editDiff("src/a.ts") },
		]);
		expect(overview).toEqual({ files: [], added: 0, removed: 0 });
	});

	it("新增与删除文件按标准头识别状态", () => {
		const overview = collectSessionChanges([
			{ toolName: "write_to_file", args: { path: "new.md" }, diff: "--- /dev/null\n+++ b/new.md\n@@\n+hi\n" },
			{ toolName: "write_to_file", args: { path: "gone.md" }, diff: "--- a/gone.md\n+++ /dev/null\n@@\n-bye\n" },
		]);
		expect(overview.files).toEqual([
			expect.objectContaining({ path: "new.md", status: "added", added: 1, removed: 0 }),
			expect.objectContaining({ path: "gone.md", status: "deleted", added: 0, removed: 1 }),
		]);
	});

	it("空输入返回空视图", () => {
		expect(collectSessionChanges([])).toEqual({ files: [], added: 0, removed: 0 });
	});
});

describe("sessionChangeCallsFromTimeline", () => {
	it("只收带 uiDetails.diff 的变更类工具调用", () => {
		const calls = sessionChangeCallsFromTimeline([
			{
				blocks: [
					{ type: "text" },
					{ type: "tool_call", toolName: "read_file", args: { path: "a" }, uiDetails: { diff: editDiff("a") } },
					{
						type: "tool_call",
						toolName: "edit_file",
						args: { file_path: "b" },
						uiDetails: { diff: editDiff("b") },
					},
					{ type: "tool_call", toolName: "write_to_file", args: { path: "c" } },
				],
			},
			{},
		]);
		expect(calls).toEqual([{ toolName: "edit_file", args: { file_path: "b" }, diff: editDiff("b") }]);
	});
});
