// Modified by The Open Forge contributors.
// @vitest-environment jsdom
import type { HistoryPage, HistoryPageRequest } from "@preload/api-types/session";
import type { ChatTimelineItem, SessionInfo } from "@shared/store/atoms";
import {
	activeSessionAtom,
	chatMessagesAtom,
	confirmDialogAtom,
	lastActiveSessionAtom,
	pendingSessionOpenAtom,
	sessionsMapAtom,
	transcriptWindowStateAtom,
} from "@shared/store/atoms";
import { waitFor } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSessionManager } from "../domains/conversation/hooks/useSessionManager";
import { readTranscriptBacklog } from "../domains/conversation/services/transcript-window";
import { loadOlderTranscriptPage } from "../domains/conversation/services/transcript-window-controller";
import { useLastSessionRestore } from "./useLastSessionRestore";

const mocks = vi.hoisted(() => {
	const values = new Map([
		["vetta-last-active-session", JSON.stringify({ cwd: "C:\\workspace", sessionPath: "C:\\sessions\\first.jsonl" })],
	]);
	vi.stubGlobal("localStorage", {
		getItem: (key: string) => values.get(key) ?? null,
		removeItem: (key: string) => void values.delete(key),
		setItem: (key: string, value: string) => void values.set(key, value),
	});
	return {
		navigate: vi.fn(async () => undefined),
	};
});

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));

function visibleTexts(messages: readonly ChatTimelineItem[]): Array<string | undefined> {
	return messages.flatMap((message) =>
		message.kind === "event" ? [] : [message.kind === "placeholder" ? message.summary : message.text],
	);
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
	let resolvePromise: ((value: T) => void) | undefined;
	return {
		promise: new Promise<T>((resolve) => {
			resolvePromise = resolve;
		}),
		resolve: (value) => resolvePromise?.(value),
	};
}

function userHistory(text: string, entryId: string) {
	return [{ type: "message" as const, entryId, message: { role: "user" as const, content: text, timestamp: 1 } }];
}

const cwd = "C:\\workspace";
const firstSessionPath = "C:\\sessions\\first.jsonl";
let container: HTMLDivElement | null = null;
let root: Root | null = null;
let manager: ReturnType<typeof useSessionManager> | null = null;

beforeEach(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	container = document.createElement("div");
	document.body.append(container);
});

afterEach(async () => {
	await act(async () => root?.unmount());
	container?.remove();
	root = null;
	container = null;
	manager = null;
	vi.unstubAllGlobals();
});

it("以有界模式打开未知大小会话后可分页并按用户选择打开完整历史", { timeout: 10_000 }, async () => {
	const store = getDefaultStore();
	const history = Array.from({ length: 2_000 }, (_, index) => userHistory(`message ${index}`, `user-${index}`)[0]);
	const frames: FrameRequestCallback[] = [];
	const idleCallbacks: IdleRequestCallback[] = [];
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		frames.push(callback);
		return frames.length;
	});
	vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) => {
		idleCallbacks.push(callback);
		return idleCallbacks.length;
	});
	const flushBackfill = () => {
		for (const callback of idleCallbacks.splice(0)) callback({ didTimeout: false, timeRemaining: () => 50 });
	};
	const creating = deferred<{ cwd: string; sessionId: string; sessionPath: string }>();
	const listing = deferred<SessionInfo[]>();
	let viewerEntriesReturned = 0;
	let fullEntriesReturned = 0;
	const sessionApi = {
		autoTitle: vi.fn(),
		create: vi.fn(() => creating.promise),
		getFullHistory: vi.fn(async () => {
			fullEntriesReturned += history.length;
			return history;
		}),
		listSessions: vi.fn(() => listing.promise),
		onSessionsChanged: vi.fn(() => vi.fn()),
		getQueueState: vi.fn(async () => ({ paused: false, entries: [] })),
		getSessionPath: vi.fn(async () => firstSessionPath),
		getState: vi.fn(async () => ({
			activeToolNames: [],
			contextPercent: null,
			contextWindow: 128_000,
			executionMode: "full-access" as const,
			isStreaming: false,
			messageCount: history.length,
			model: null,
			scenario: "project" as const,
		})),
		openViewer: vi.fn(async (_path: string, options: HistoryPageRequest): Promise<HistoryPage> => {
			const end = options.beforeEntry ? Number(options.beforeEntry.replace("before-", "")) : history.length;
			const start = Math.max(0, end - (options.tailTurns ?? 100));
			const entries = history.slice(start, end);
			viewerEntriesReturned += entries.length;
			return {
				history: entries,
				head: !options.beforeEntry,
				hasMore: start > 0,
				nextBeforeEntry: start > 0 ? `before-${start}` : undefined,
			};
		}),
		prompt: vi.fn(),
		subscribe: vi.fn(async () => vi.fn()),
		updateSettings: vi.fn(async () => undefined),
	};
	Object.defineProperty(window, "vetta", {
		configurable: true,
		value: {
			batchTasks: { resumeTaskWithText: vi.fn() },
			config: { get: vi.fn(), onProjectsChanged: vi.fn(() => vi.fn()) },
			im: { onSessionChanged: vi.fn(() => vi.fn()) },
			dialog: { persistImages: vi.fn() },
			session: sessionApi,
		},
	});
	store.set(sessionsMapAtom, new Map());
	expect(store.get(lastActiveSessionAtom)).toEqual({ cwd, sessionPath: firstSessionPath });

	function Probe() {
		manager = useSessionManager();
		useLastSessionRestore("/");
		return null;
	}

	await act(async () => {
		root = createRoot(container as HTMLDivElement);
		root.render(createElement(Probe));
	});
	// 演示定稿：启动不再恢复上次会话，导航新会话页；有界历史加载合同由显式打开触发。
	await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: "/new-session" }));

	let tailOpening: Promise<void> | undefined;
	await act(async () => {
		tailOpening = manager?.openSession(cwd, firstSessionPath, undefined, { historyLoadMode: "tail" });
	});
	expect(store.get(pendingSessionOpenAtom)?.sessionPath).toBe(firstSessionPath);
	expect(store.get(activeSessionAtom)).toBeNull();
	expect(visibleTexts(store.get(chatMessagesAtom))).toEqual(["message 1998", "message 1999"]);
	expect(sessionApi.create).not.toHaveBeenCalled();
	expect(store.get(confirmDialogAtom)).toBeNull();

	await act(async () => {
		frames.shift()?.(0);
		frames.shift()?.(16);
	});
	expect(sessionApi.create).toHaveBeenCalledOnce();
	await act(async () => {
		creating.resolve({ cwd, sessionId: "runtime-restored", sessionPath: firstSessionPath });
		await tailOpening;
	});
	expect(store.get(activeSessionAtom)?.runtimeId).toBe("runtime-restored");
	expect(store.get(pendingSessionOpenAtom)).toBeNull();
	expect(store.get(sessionsMapAtom).size).toBe(0);

	await act(async () => {
		flushBackfill();
		listing.resolve([
			{
				id: "first",
				path: firstSessionPath,
				cwd,
				firstMessage: "message 0",
				modifiedAt: 1,
				fileSizeBytes: 8 * 1024 * 1024,
			},
		]);
	});
	expect(store.get(sessionsMapAtom).get(cwd)?.[0]?.fileSizeBytes).toBe(8 * 1024 * 1024);
	expect(store.get(chatMessagesAtom).length).toBe(10);
	expect(visibleTexts(store.get(chatMessagesAtom))).toEqual(history.slice(-10).map((entry) => entry.message.content));
	expect(readTranscriptBacklog(firstSessionPath)?.entries.length).toBe(10);
	expect(readTranscriptBacklog(firstSessionPath)).toMatchObject({
		hasMore: true,
		nextBeforeEntry: "before-1990",
		unbounded: false,
	});
	expect(store.get(transcriptWindowStateAtom)).toMatchObject({ sessionPath: firstSessionPath, hasMore: true });
	expect(viewerEntriesReturned).toBe(12);
	expect(fullEntriesReturned).toBe(0);
	expect(sessionApi.getFullHistory).not.toHaveBeenCalled();

	await act(async () => {
		root?.render(createElement(Probe));
		flushBackfill();
	});
	expect(sessionApi.create).toHaveBeenCalledOnce();
	expect(store.get(chatMessagesAtom).length).toBe(10);
	expect(readTranscriptBacklog(firstSessionPath)?.entries.length).toBe(10);

	await act(async () => {
		expect(await loadOlderTranscriptPage()).toBe(100);
	});
	expect(visibleTexts(store.get(chatMessagesAtom))).toEqual(history.slice(-110).map((entry) => entry.message.content));
	expect(readTranscriptBacklog(firstSessionPath)?.entries.length).toBe(110);
	expect(sessionApi.openViewer).toHaveBeenLastCalledWith(firstSessionPath, { beforeEntry: "before-1990" });
	expect(sessionApi.getFullHistory).not.toHaveBeenCalled();

	// A deliberate full reopen retains the existing complete-history contract.
	let opening: Promise<void> | undefined;
	await act(async () => {
		opening = manager?.openSession(cwd, firstSessionPath, undefined, { historyLoadMode: "full" });
	});
	expect(store.get(confirmDialogAtom)).toBeNull();
	await act(async () => {
		frames.shift()?.(32);
		frames.shift()?.(48);
		await opening;
		flushBackfill();
	});
	expect(sessionApi.getFullHistory).toHaveBeenCalledWith("runtime-restored");
	expect(fullEntriesReturned).toBe(2_000);
	expect(store.get(chatMessagesAtom).length).toBe(2_000);
	expect(visibleTexts(store.get(chatMessagesAtom))).toEqual(history.map((entry) => entry.message.content));
	expect(readTranscriptBacklog(firstSessionPath)).toMatchObject({ hasMore: false, unbounded: true });
	expect(readTranscriptBacklog(firstSessionPath)?.entries.length).toBe(2_000);
});
