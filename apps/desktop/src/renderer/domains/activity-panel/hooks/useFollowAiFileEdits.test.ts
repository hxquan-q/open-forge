// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * 跟随 AI 编辑的行为合同：全局 aiEditTarget 更新时预览切到对应文件；同一目标不重复
 * 触发；无目标不动。目标解析（相对路径补全/写类工具判定）见 ai-activity-atoms 单测。
 */

import { aiEditTargetAtom, inlineFilePreviewContextReadonlyAtom } from "@shared/store/atoms";
import { act, renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, expect, it } from "vitest";
import { useFollowAiFileEdits } from "./useFollowAiFileEdits";

const store = getDefaultStore();

beforeEach(() => {
	store.set(aiEditTargetAtom, null);
	store.set(inlineFilePreviewContextReadonlyAtom, null);
});

it("目标更新时把文件写进内嵌预览；同一目标不重复写，换目标即切换", () => {
	const { rerender } = renderHook(() => useFollowAiFileEdits());

	act(() => {
		store.set(aiEditTargetAtom, { path: "/proj/x/src/b.ts", at: 1 });
	});
	rerender();
	expect(store.get(inlineFilePreviewContextReadonlyAtom)).toMatchObject({
		items: [{ name: "b.ts", path: "/proj/x/src/b.ts" }],
	});

	// 同一文件再次编辑（at 变化）：不重置预览。
	act(() => {
		store.set(aiEditTargetAtom, { path: "/proj/x/src/b.ts", at: 2 });
	});
	rerender();
	expect(store.get(inlineFilePreviewContextReadonlyAtom)?.items[0]?.path).toBe("/proj/x/src/b.ts");

	// 换目标：预览切换。
	act(() => {
		store.set(aiEditTargetAtom, { path: "C:/abs/d.ts", at: 3 });
	});
	rerender();
	expect(store.get(inlineFilePreviewContextReadonlyAtom)?.items[0]?.path).toBe("C:/abs/d.ts");
});

it("无目标（null）时不写预览", () => {
	const { rerender } = renderHook(() => useFollowAiFileEdits());
	act(() => {
		store.set(aiEditTargetAtom, null);
	});
	rerender();
	expect(store.get(inlineFilePreviewContextReadonlyAtom)).toBeNull();
});
