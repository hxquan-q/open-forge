// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * 跟随 AI 编辑的行为合同：最近一次写类工具调用的目标文件被写进内嵌预览（含相对路径
 * 按项目根补全），同一目标连续编辑不重复触发，读类/无关调用不驱动预览。
 */

import { chatMessagesAtom, inlineFilePreviewContextReadonlyAtom } from "@shared/store/atoms";
import { act, renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, expect, it } from "vitest";
import { latestAiEditTarget, useFollowAiFileEdits } from "./useFollowAiFileEdits";

const store = getDefaultStore();

function messageWithTool(toolName: string, args: Record<string, unknown>): unknown {
	return {
		id: `m-${toolName}-${JSON.stringify(args).length}`,
		blocks: [{ type: "tool_call", toolName, args }],
	};
}

beforeEach(() => {
	store.set(chatMessagesAtom, [] as never);
	store.set(inlineFilePreviewContextReadonlyAtom, null);
});

it("latestAiEditTarget 从末尾找最近的写类调用，忽略读类调用", () => {
	const items = [
		messageWithTool("read", { path: "a.ts" }),
		messageWithTool("edit", { file_path: "src/b.ts" }),
		messageWithTool("grep", { pattern: "x" }),
		messageWithTool("write", { path: "docs/c.md" }),
	];
	expect(latestAiEditTarget(items)).toBe("docs/c.md");
});

it("目标变化时把绝对路径写进内嵌预览；同一目标不重复写", () => {
	const { rerender } = renderHook(() => useFollowAiFileEdits("/proj/x"));

	act(() => {
		store.set(chatMessagesAtom, [messageWithTool("edit", { file_path: "src/b.ts" })] as never);
	});
	rerender();
	expect(store.get(inlineFilePreviewContextReadonlyAtom)).toMatchObject({
		items: [{ name: "b.ts", path: "/proj/x/src/b.ts" }],
	});

	// 同一文件再次出现：不重置用户预览（仍是同一项）。
	act(() => {
		store.set(chatMessagesAtom, [
			messageWithTool("edit", { file_path: "src/b.ts" }),
			messageWithTool("edit", { file_path: "src/b.ts" }),
		] as never);
	});
	rerender();
	expect(store.get(inlineFilePreviewContextReadonlyAtom)?.items[0]?.path).toBe("/proj/x/src/b.ts");

	// 换目标：预览切换。
	act(() => {
		store.set(chatMessagesAtom, [messageWithTool("write", { path: "C:/abs/d.ts" })] as never);
	});
	rerender();
	expect(store.get(inlineFilePreviewContextReadonlyAtom)?.items[0]?.path).toBe("C:/abs/d.ts");
});

it("没有任何写类调用时不写预览", () => {
	const { rerender } = renderHook(() => useFollowAiFileEdits("/proj/x"));
	act(() => {
		store.set(chatMessagesAtom, [messageWithTool("read", { path: "a.ts" })] as never);
	});
	rerender();
	expect(store.get(inlineFilePreviewContextReadonlyAtom)).toBeNull();
});
