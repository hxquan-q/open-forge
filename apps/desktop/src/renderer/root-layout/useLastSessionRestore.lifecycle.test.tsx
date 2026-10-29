// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import {
	activeSessionAtom,
	lastActiveSessionAtom,
	pendingSessionCreationAtom,
	pendingSessionOpenAtom,
} from "@shared/store/atoms";
import { getDefaultStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLastSessionRestore } from "./useLastSessionRestore";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(async () => undefined) }));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));

beforeEach(() => {
	const store = getDefaultStore();
	store.set(activeSessionAtom, null);
	store.set(pendingSessionCreationAtom, null);
	store.set(pendingSessionOpenAtom, null);
	store.set(lastActiveSessionAtom, { cwd: "/workspace", sessionPath: "/sessions/previous.jsonl" });
	mocks.navigate.mockClear();
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("startup falls through to new session (演示定稿：不恢复上次会话)", () => {
	it("根路由启动导航到新会话页，不自动恢复上次会话", async () => {
		const { result } = renderHook(() => useLastSessionRestore("/"));
		await waitFor(() => expect(result.current).toBe("complete"));
		expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith({ to: "/new-session" });
		// 持久化的上次会话定位被清掉，不留残留误导后续消费者。
		expect(getDefaultStore().get(lastActiveSessionAtom)).toBeNull();
		expect(getDefaultStore().get(activeSessionAtom)).toBeNull();
	});

	it("已有活动会话（深链先落）不抢跳，保持原路由行为", () => {
		const store = getDefaultStore();
		const active = { cwd: "/workspace", runtimeId: "active", sessionPath: "/sessions/active.jsonl" };
		store.set(activeSessionAtom, active);
		const { result } = renderHook(() => useLastSessionRestore("/"));
		expect(result.current).toBe("complete");
		expect(store.get(activeSessionAtom)).toBe(active);
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	it("会话创建/打开进行中不抢跳", () => {
		const store = getDefaultStore();
		store.set(pendingSessionOpenAtom, {
			cwd: "/workspace",
			sessionPath: "/sessions/opening.jsonl",
		} as never);
		const { result } = renderHook(() => useLastSessionRestore("/"));
		expect(result.current).toBe("complete");
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	it("非根路由（深链直达会话等）不做启动处理", () => {
		renderHook(() => useLastSessionRestore("/chat/deep-link"));
		expect(mocks.navigate).not.toHaveBeenCalled();
	});
});
