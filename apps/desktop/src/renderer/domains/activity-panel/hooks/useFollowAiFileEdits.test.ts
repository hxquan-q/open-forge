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
import type { ReactNode } from "react";
import { createElement } from "react";
import { beforeEach, expect, it } from "vitest";
import { ActivityPanelContextProvider } from "../registry/context";
import { useFollowAiFileEdits } from "./useFollowAiFileEdits";

const store = getDefaultStore();

function renderFollow(hotTracking = true): ReturnType<typeof renderHook> {
	const wrapper = ({ children }: { children: ReactNode }) =>
		createElement(
			ActivityPanelContextProvider,
			{
				value: {
					workspace: { id: "ws-1", cwd: "/proj/x", runtimeIds: [] },
					knowledgeHistory: false,
					hotTracking,
				},
			},
			children,
		);
	return renderHook(() => useFollowAiFileEdits(), { wrapper });
}

beforeEach(() => {
	store.set(aiEditTargetAtom, null);
	store.set(inlineFilePreviewContextReadonlyAtom, null);
});

it("does not replay a same-cwd edit target that predates hook mount", () => {
	store.set(aiEditTargetAtom, { path: "/proj/x/src/old.ts", at: 1, cwd: "/proj/x" });
	store.set(inlineFilePreviewContextReadonlyAtom, {
		items: [{ name: "manual.ts", path: "/proj/x/src/manual.ts" }],
		index: 0,
	});

	const { rerender } = renderFollow();
	expect(store.get(inlineFilePreviewContextReadonlyAtom)?.items[0]?.path).toBe("/proj/x/src/manual.ts");

	act(() => {
		store.set(aiEditTargetAtom, { path: "/proj/x/src/new.ts", at: 2, cwd: "/proj/x" });
	});
	rerender();
	expect(store.get(inlineFilePreviewContextReadonlyAtom)?.items[0]?.path).toBe("/proj/x/src/new.ts");
});

it("目标更新时把文件写进内嵌预览；同一目标不重复写，换目标即切换", () => {
	const { rerender } = renderFollow();

	act(() => {
		store.set(aiEditTargetAtom, { path: "/proj/x/src/b.ts", at: 1, cwd: "/proj/x" });
	});
	rerender();
	expect(store.get(inlineFilePreviewContextReadonlyAtom)).toMatchObject({
		items: [{ name: "b.ts", path: "/proj/x/src/b.ts" }],
	});

	// 同一文件再次编辑（at 变化）：不重置预览。
	act(() => {
		store.set(aiEditTargetAtom, { path: "/proj/x/src/b.ts", at: 2, cwd: "/proj/x" });
	});
	rerender();
	expect(store.get(inlineFilePreviewContextReadonlyAtom)?.items[0]?.path).toBe("/proj/x/src/b.ts");

	// 换目标：预览切换。
	act(() => {
		store.set(aiEditTargetAtom, { path: "C:/abs/d.ts", at: 3, cwd: "/proj/x" });
	});
	rerender();
	expect(store.get(inlineFilePreviewContextReadonlyAtom)?.items[0]?.path).toBe("C:/abs/d.ts");
});

it("用户切到别的文件后，同一文件的再次编辑跟回；无新活动不回拉手动浏览", () => {
	const { rerender } = renderFollow();

	act(() => {
		store.set(aiEditTargetAtom, { path: "/proj/x/src/a.ts", at: 1, cwd: "/proj/x" });
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
		store.set(aiEditTargetAtom, { path: "/proj/x/src/a.ts", at: 2, cwd: "/proj/x" });
	});
	rerender();
	const followed = store.get(inlineFilePreviewContextReadonlyAtom);
	expect(followed?.items).toHaveLength(1);
	expect(followed?.items[0]?.path).toBe("/proj/x/src/a.ts");
});

it("预览已在目标文件上时，连续编辑不重置多文件上下文", () => {
	const { rerender } = renderFollow();

	act(() => {
		store.set(aiEditTargetAtom, { path: "/proj/x/src/a.ts", at: 1, cwd: "/proj/x" });
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
		store.set(aiEditTargetAtom, { path: "/proj/x/src/a.ts", at: 2, cwd: "/proj/x" });
	});
	rerender();
	const kept = store.get(inlineFilePreviewContextReadonlyAtom);
	expect(kept?.items).toHaveLength(2);
	expect(kept?.index).toBe(0);
});

it("无目标（null）时不写预览", () => {
	const { rerender } = renderFollow();
	act(() => {
		store.set(aiEditTargetAtom, null);
	});
	rerender();
	expect(store.get(inlineFilePreviewContextReadonlyAtom)).toBeNull();
});

it("§11.3：hotTracking=false（非 coding 挂载点）完全不跟随", () => {
	const { rerender } = renderFollow(false);
	act(() => {
		store.set(aiEditTargetAtom, { path: "/proj/x/src/a.ts", at: 1, cwd: "/proj/x" });
	});
	rerender();
	expect(store.get(inlineFilePreviewContextReadonlyAtom)).toBeNull();
});

it("F03：其他项目遗留的编辑目标不被消费（按来源 cwd 过滤）", () => {
	const { rerender } = renderFollow();
	// 项目 A 遗留的全局目标，当前面板工作区是 /proj/x。
	act(() => {
		store.set(aiEditTargetAtom, { path: "/project-a/private.ts", at: 1, cwd: "/project-a" });
	});
	rerender();
	expect(store.get(inlineFilePreviewContextReadonlyAtom)).toBeNull();
});
