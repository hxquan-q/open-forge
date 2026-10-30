// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * 跟随 AI 编辑的行为合同：新 AI 活动把内嵌预览切到对应文件；去重看当前实际预览——
 * 用户切到别的文件后同一文件的再次编辑仍跟回，手动浏览不被旧目标回拉，预览已在目标
 * 文件上时不重置多文件上下文。目标解析见 ai-activity-atoms 单测。
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

it("用户切到别的文件后，同一文件的再次编辑跟回；无新活动不回拉手动浏览", () => {
	const { rerender } = renderHook(() => useFollowAiFileEdits());

	act(() => {
		store.set(aiEditTargetAtom, { path: "/proj/x/src/a.ts", at: 1 });
	});
	rerender();
	expect(store.get(inlineFilePreviewContextReadonlyAtom)?.items[0]?.path).toBe("/proj/x/src/a.ts");

	// 用户手动浏览：多文件上下文选中 b——旧目标不得把浏览拉回。
	act(() => {
		store.set(inlineFilePreviewContextReadonlyAtom, {
			items: [
				{ name: "a.ts", path: "/proj/x/src/a.ts" },
				{ name: "b.ts", path: "/proj/x/src/b.ts" },
			],
			index: 1,
		});
	});
	rerender();
	expect(store.get(inlineFilePreviewContextReadonlyAtom)?.items[1]?.path).toBe("/proj/x/src/b.ts");

	// AI 再次编辑 a：预览跟回 a（旧实现停留 b）。
	act(() => {
		store.set(aiEditTargetAtom, { path: "/proj/x/src/a.ts", at: 2 });
	});
	rerender();
	const followed = store.get(inlineFilePreviewContextReadonlyAtom);
	expect(followed?.items).toHaveLength(1);
	expect(followed?.items[0]?.path).toBe("/proj/x/src/a.ts");
});

it("预览已在目标文件上时，连续编辑不重置多文件上下文", () => {
	const { rerender } = renderHook(() => useFollowAiFileEdits());

	act(() => {
		store.set(aiEditTargetAtom, { path: "/proj/x/src/a.ts", at: 1 });
	});
	rerender();
	// 用户重建多文件上下文且当前选中正是 a。
	act(() => {
		store.set(inlineFilePreviewContextReadonlyAtom, {
			items: [
				{ name: "a.ts", path: "/proj/x/src/a.ts" },
				{ name: "b.ts", path: "/proj/x/src/b.ts" },
			],
			index: 0,
		});
	});
	rerender();

	act(() => {
		store.set(aiEditTargetAtom, { path: "/proj/x/src/a.ts", at: 2 });
	});
	rerender();
	const kept = store.get(inlineFilePreviewContextReadonlyAtom);
	expect(kept?.items).toHaveLength(2);
	expect(kept?.index).toBe(0);
});

it("无目标（null）时不写预览", () => {
	const { rerender } = renderHook(() => useFollowAiFileEdits());
	act(() => {
		store.set(aiEditTargetAtom, null);
	});
	rerender();
	expect(store.get(inlineFilePreviewContextReadonlyAtom)).toBeNull();
});
