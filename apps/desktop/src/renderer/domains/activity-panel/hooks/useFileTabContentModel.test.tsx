// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * 文件页签的卸载语义（BUG-0162）：切走页签/离开会话只清空内嵌预览上下文，
 * 不回拉面板宽度——宽度属于版块态初始化或用户选择。用户主动点「关闭预览」
 * 仍走完整关闭（含回拉），由第二用例看守。
 */
import {
	activityPanelWidthAtom,
	inlineFilePreviewContextReadonlyAtom,
} from "@shared/store/atoms";
import { act, renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, expect, it } from "vitest";
import { useFileTabContentModel } from "./useFileTabContentModel";

const store = getDefaultStore();

beforeEach(() => {
	store.set(inlineFilePreviewContextReadonlyAtom, null);
	store.set(activityPanelWidthAtom, 628);
});

function openAutoPreview(): void {
	act(() => {
		store.set(inlineFilePreviewContextReadonlyAtom, {
			items: [{ name: "a.ts", path: "/proj/a.ts" }],
			index: 0,
		});
	});
}

it("卸载清空预览上下文，但不改面板宽度", () => {
	const { unmount } = renderHook(() => useFileTabContentModel());
	openAutoPreview();
	expect(store.get(inlineFilePreviewContextReadonlyAtom)).not.toBeNull();

	unmount();
	expect(store.get(inlineFilePreviewContextReadonlyAtom)).toBeNull();
	expect(store.get(activityPanelWidthAtom)).toBe(628);
});

it("用户主动关闭预览仍回拉宽度到默认（既有语义看守）", () => {
	const { result } = renderHook(() => useFileTabContentModel());
	openAutoPreview();

	act(() => {
		result.current.closePreview();
	});
	expect(store.get(inlineFilePreviewContextReadonlyAtom)).toBeNull();
	expect(store.get(activityPanelWidthAtom)).toBe(360);
});
