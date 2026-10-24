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

const previous = { cwd: "/workspace", sessionPath: "/sessions/previous.jsonl" };

beforeEach(() => {
	const store = getDefaultStore();
	store.set(activeSessionAtom, null);
	store.set(pendingSessionCreationAtom, null);
	store.set(pendingSessionOpenAtom, null);
	store.set(lastActiveSessionAtom, previous);
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("last-session restore lifecycle", () => {
	it("completes without opening a session when no saved session exists", () => {
		getDefaultStore().set(lastActiveSessionAtom, null);
		const openSession = vi.fn(async () => undefined);
		const { result } = renderHook(() => useLastSessionRestore("/", openSession));
		expect(result.current).toBe("complete");
		expect(openSession).not.toHaveBeenCalled();
	});
	it("keeps an already active session and does not restore over it", () => {
		const store = getDefaultStore();
		const active = { cwd: "/workspace", runtimeId: "active", sessionPath: "/sessions/active.jsonl" };
		store.set(activeSessionAtom, active);
		const openSession = vi.fn(async () => undefined);
		const { result } = renderHook(() => useLastSessionRestore("/", openSession));
		expect(result.current).toBe("complete");
		expect(store.get(activeSessionAtom)).toBe(active);
		expect(openSession).not.toHaveBeenCalled();
	});
	it("clears an unavailable saved session and completes so the normal fallback can proceed", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const store = getDefaultStore();
		const openSession = vi.fn(async () => { throw new Error("session no longer available"); });
		const { result } = renderHook(() => useLastSessionRestore("/", openSession));
		await waitFor(() => expect(result.current).toBe("complete"));
		expect(store.get(activeSessionAtom)).toBeNull();
		expect(store.get(lastActiveSessionAtom)).toBeNull();
		expect(openSession).toHaveBeenCalledOnce();
	});
});
