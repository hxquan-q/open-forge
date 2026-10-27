// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * 版块态布局合同：进入 code 会话收左栏、开右栏；切回普通会话展开左栏；档位不变时
 * 不写状态（用户手动开合不被覆盖）。
 */

import { activeSessionAtom, activityPanelOpenAtom, sidebarCollapsedAtom } from "@shared/store/atoms";
import { act, renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, expect, it } from "vitest";
import { useCodingSessionLayout } from "./useCodingSessionLayout";

const store = getDefaultStore();

function setActive(profile: "coding" | "work" | null): void {
	store.set(
		activeSessionAtom,
		profile === null
			? null
			: ({
					cwd: "/proj/a",
					runtimeId: `rt-${profile}`,
					sessionPath: `/proj/a/${profile}.jsonl`,
					capabilityProfile: profile,
				} as never),
	);
}

beforeEach(() => {
	store.set(activeSessionAtom, null);
	store.set(sidebarCollapsedAtom, false);
	store.set(activityPanelOpenAtom, false);
});

it("进入 code 会话：收左栏、开右栏", () => {
	const { rerender } = renderHook(() => useCodingSessionLayout());
	act(() => {
		setActive("coding");
	});
	rerender();
	expect(store.get(sidebarCollapsedAtom)).toBe(true);
	expect(store.get(activityPanelOpenAtom)).toBe(true);
});

it("切回普通会话：展开左栏（右栏不动）", () => {
	const { rerender } = renderHook(() => useCodingSessionLayout());
	act(() => {
		setActive("coding");
	});
	rerender();
	act(() => {
		setActive("work");
	});
	rerender();
	expect(store.get(sidebarCollapsedAtom)).toBe(false);
});

it("档位不变时不覆盖用户手动开合", () => {
	const { rerender } = renderHook(() => useCodingSessionLayout());
	act(() => {
		setActive("coding");
	});
	rerender();
	// 用户在 code 会话里手动展开左栏、收起右栏。
	act(() => {
		store.set(sidebarCollapsedAtom, false);
		store.set(activityPanelOpenAtom, false);
	});
	// 会话对象更新（同档位）不应重置用户选择。
	act(() => {
		store.set(activeSessionAtom, {
			cwd: "/proj/a",
			runtimeId: "rt-coding-2",
			sessionPath: "/proj/a/coding2.jsonl",
			capabilityProfile: "coding",
		} as never);
	});
	rerender();
	expect(store.get(sidebarCollapsedAtom)).toBe(false);
	expect(store.get(activityPanelOpenAtom)).toBe(false);
});
