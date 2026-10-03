// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { activeSessionAtom, goalStateBySessionAtom } from "@shared/store/atoms";
import type { CodingAgentGoalState } from "@vetta/coding-agent/session-extensions";
import { Provider, createStore } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useGoalModeModel } from "./useGoalModeModel";

function goalState(overrides: Partial<CodingAgentGoalState> = {}): CodingAgentGoalState {
	return {
		goalId: "goal-1",
		objective: "整理收件箱",
		status: "active",
		...overrides,
	} as CodingAgentGoalState;
}

function setupStore() {
	const store = createStore();
	store.set(activeSessionAtom, { cwd: "/w", sessionPath: "/w/s.jsonl", runtimeId: "session-1" });
	return store;
}

function wrapperFor(store: ReturnType<typeof createStore>) {
	return ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
}

/** 手动放行的人工 deferred：请求在途期间注入实时观察，验证回执不覆盖已观察状态。 */
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

describe("useGoalModeModel 迟到回执竞态", () => {
	it("请求在途期间目标被实时观察更新过时，回执不再覆盖", async () => {
		const store = setupStore();
		const request = deferred<CodingAgentGoalState | null>();
		vi.stubGlobal("window", {
			vetta: { session: { startGoal: vi.fn(() => request.promise) } },
		});
		const { result } = renderHook(() => useGoalModeModel(), { wrapper: wrapperFor(store) });

		let pending: Promise<void> | undefined;
		await act(async () => {
			pending = result.current.start("整理收件箱");
		});
		expect(result.current.busy).toBe(true);

		// 实时观察先到：目标已被观察为 active（状态投影发生真实变化）。
		const observed = goalState({ status: "active" });
		await act(async () => {
			store.set(goalStateBySessionAtom, { "session-1": observed });
		});
		// 迟到的启动回执携带执行前的旧快照（paused），不得覆盖已观察状态。
		await act(async () => {
			request.resolve(goalState({ status: "paused" }));
			await pending;
		});

		expect(store.get(goalStateBySessionAtom)["session-1"]).toEqual(observed);
		vi.unstubAllGlobals();
	});

	it("没有并发观察时，回执正常写入投影", async () => {
		const store = setupStore();
		const state = goalState();
		vi.stubGlobal("window", {
			vetta: { session: { startGoal: vi.fn(async () => state) } },
		});
		const { result } = renderHook(() => useGoalModeModel(), { wrapper: wrapperFor(store) });

		await act(async () => {
			await result.current.start("整理收件箱");
		});

		expect(store.get(goalStateBySessionAtom)["session-1"]).toEqual(state);
		vi.unstubAllGlobals();
	});

	it("失败时给出可恢复提示且不清空已有投影", async () => {
		const store = setupStore();
		store.set(goalStateBySessionAtom, {
			"session-1": goalState({ status: "paused" }),
		});
		vi.stubGlobal("window", {
			vetta: { session: { resumeGoal: vi.fn(async () => Promise.reject(new Error("boom"))) } },
		});
		const { result } = renderHook(() => useGoalModeModel(), { wrapper: wrapperFor(store) });

		await act(async () => {
			await result.current.resume();
		});
		expect(result.current.busy).toBe(false);
		expect(store.get(goalStateBySessionAtom)["session-1"]).toMatchObject({ status: "paused" });
		vi.unstubAllGlobals();
	});
});
