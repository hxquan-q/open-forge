// Modified by The Open Forge contributors.
// @vitest-environment jsdom
import type { HistoryPage } from "@preload/api-types/session";
import { createConversationAgentMessage, createConversationUserMessage } from "@shared/conversation";
import {
	activeSessionAtom,
	chatMessagesAtom,
	TRANSCRIPT_WINDOW_FIRST_INDEX,
	transcriptWindowStateAtom,
} from "@shared/store/atoms";
import type { HistoryEntry } from "@vetta/runtime-core";
import { getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fullHistoryToChatWithSpans } from "./chat-service";
import { clearOptimisticUserMessages, rememberOptimisticUserMessage } from "./optimistic-user-message-cache";
import { applyTranscriptWindow, clearTranscriptBacklog, readTranscriptBacklog } from "./transcript-window";
import {
	commitTranscriptWindow,
	drainActiveTranscriptWindow,
	loadOlderTranscriptPage,
	refreshTranscriptTail,
	resetTranscriptWindowState,
	resetTranscriptWindowToTail,
} from "./transcript-window-controller";

const store = getDefaultStore();
const SESSION_PATH = "/sessions/a.jsonl";
const RUNTIME_ID = "runtime-a";

function userEntry(entryId: string, text: string): HistoryEntry {
	return { type: "message", entryId, message: { role: "user", content: text, timestamp: 1 } };
}

function agentEntry(entryId: string, text: string): HistoryEntry {
	return {
		type: "message",
		entryId,
		message: {
			role: "assistant",
			content: [{ type: "text", text }],
			api: "openai-responses",
			provider: "openai",
			model: "test",
			usage: {
				input: 1,
				output: 1,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 2,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: 2,
		},
	};
}

function page(entries: HistoryEntry[], overrides?: Partial<HistoryPage>): HistoryPage {
	return { history: entries, hasMore: false, head: true, ...overrides };
}

/** HistoryEntry 是联合类型，timing/marker 类条目没有 entryId。 */
function entryIdOf(entry: HistoryEntry): string | undefined {
	return "entryId" in entry ? entry.entryId : undefined;
}

const openViewer = vi.fn();

function setActiveSession(path = SESSION_PATH): void {
	store.set(activeSessionAtom, { cwd: "/workspace", sessionPath: path, runtimeId: RUNTIME_ID });
}

/**
 * 以窗口化尾页登记会话：backlog 与 chatMessages 同源投影，窗口态走
 * commitTranscriptWindow（与打开路径一致）。
 */
function seedWindow(entries: HistoryEntry[], cursor: { nextBeforeEntry?: string; hasMore: boolean }): void {
	const projected = fullHistoryToChatWithSpans(entries, RUNTIME_ID);
	store.set(chatMessagesAtom, projected.messages);
	commitTranscriptWindow(
		SESSION_PATH,
		{
			entries,
			spans: projected.spans,
			mediaSessionId: RUNTIME_ID,
			nextBeforeEntry: cursor.nextBeforeEntry,
			hasMore: cursor.hasMore,
		},
		{ resetFirstIndex: true },
	);
}

function entryIds(): (string | undefined)[] {
	return store.get(chatMessagesAtom).map((item) => ("entryId" in item ? item.entryId : undefined));
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

beforeEach(() => {
	clearTranscriptBacklog();
	clearOptimisticUserMessages();
	resetTranscriptWindowState();
	store.set(chatMessagesAtom, []);
	store.set(activeSessionAtom, null);
	openViewer.mockReset();
	Object.defineProperty(window, "vetta", {
		configurable: true,
		value: { session: { openViewer } },
	});
});

describe("loadOlderTranscriptPage", () => {
	it("clears older loading when a reset fails and allows pagination to recover", async () => {
		setActiveSession();
		seedWindow([userEntry("u1", "one")], { hasMore: true, nextBeforeEntry: "cursor" });
		const older = deferred<HistoryPage>();
		openViewer.mockReturnValueOnce(older.promise).mockRejectedValueOnce(new Error("offline"));
		const loading = loadOlderTranscriptPage();
		await expect(resetTranscriptWindowToTail()).rejects.toThrow("offline");
		older.resolve(page([userEntry("u0", "zero")]));
		await loading;
		expect(store.get(transcriptWindowStateAtom).loadingOlder).toBe(false);
		openViewer.mockResolvedValueOnce(page([userEntry("u0", "zero")]));
		expect(await loadOlderTranscriptPage()).toBe(1);
	});
	it.each(["failed", "declined"])("retains an earlier successful tail when a newer refresh is %s", async (outcome) => {
		setActiveSession();
		seedWindow([userEntry("u1", "one")], { hasMore: false });
		const first = deferred<HistoryPage>();
		openViewer.mockReturnValueOnce(first.promise);
		const a = refreshTranscriptTail();
		if (outcome === "failed") {
			openViewer.mockRejectedValueOnce(new Error("offline"));
			await expect(refreshTranscriptTail()).rejects.toThrow("offline");
		} else {
			openViewer.mockResolvedValueOnce(page([userEntry("u1", "one"), agentEntry("a2", "declined")]));
			await refreshTranscriptTail({ shouldCommit: () => false });
		}
		first.resolve(page([userEntry("u1", "one"), agentEntry("a1", "accepted")]));
		await a;
		expect(entryIds()).toEqual(["u1", "a1"]);
	});

	it("merges overlapping history once while retaining live identity, drafts and the scroll anchor", async () => {
		setActiveSession();
		seedWindow([userEntry("u-9", "q9"), agentEntry("a-9", "a9")], { nextBeforeEntry: "c1", hasMore: true });
		const [oldUser, oldAgent] = store.get(chatMessagesAtom);
		const draft = createConversationAgentMessage({ id: "draft", phase: "streaming", blocks: [] });
		store.set(chatMessagesAtom, [...store.get(chatMessagesAtom), draft]);
		openViewer.mockResolvedValueOnce(
			page([userEntry("u-8", "q8"), agentEntry("a-8", "a8"), userEntry("u-9", "q9"), agentEntry("a-9", "a9")], {
				head: false,
			}),
		);
		expect(await loadOlderTranscriptPage()).toBe(2);
		expect(readTranscriptBacklog(SESSION_PATH)?.entries.map(entryIdOf)).toEqual(["u-8", "a-8", "u-9", "a-9"]);
		expect(store.get(transcriptWindowStateAtom).firstItemIndex).toBe(TRANSCRIPT_WINDOW_FIRST_INDEX - 2);
		expect(store.get(chatMessagesAtom).slice(2)).toEqual([oldUser, oldAgent, draft]);
		expect(store.get(chatMessagesAtom)[2]).toBe(oldUser);
		expect(store.get(chatMessagesAtom)[3]).toBe(oldAgent);
		expect(store.get(chatMessagesAtom)[4]).toBe(draft);
		openViewer.mockResolvedValueOnce(
			page([userEntry("u-9", "q9"), agentEntry("a-9", "a9"), userEntry("u-10", "q10")]),
		);
		await refreshTranscriptTail();
		expect(readTranscriptBacklog(SESSION_PATH)?.entries.map(entryIdOf)).toEqual(["u-8", "a-8", "u-9", "a-9", "u-10"]);
	});

	it.each(["older-first", "tail-first"])(
		"retains both sides of concurrent pagination and live refresh (%s)",
		async (order) => {
			setActiveSession();
			seedWindow([userEntry("u-9", "q9")], { nextBeforeEntry: "c1", hasMore: true });
			const older = deferred<HistoryPage>();
			const tail = deferred<HistoryPage>();
			openViewer.mockReturnValueOnce(older.promise).mockReturnValueOnce(tail.promise);
			const load = loadOlderTranscriptPage();
			const refresh = refreshTranscriptTail();
			if (order === "older-first") {
				older.resolve(page([userEntry("u-8", "q8")], { head: false }));
				await load;
				tail.resolve(page([userEntry("u-9", "q9"), userEntry("u-10", "q10")]));
			} else {
				tail.resolve(page([userEntry("u-9", "q9"), userEntry("u-10", "q10")]));
				await refresh;
				older.resolve(page([userEntry("u-8", "q8")], { head: false }));
			}
			await Promise.all([load, refresh]);
			expect(readTranscriptBacklog(SESSION_PATH)?.entries.map(entryIdOf)).toEqual(["u-8", "u-9", "u-10"]);
			expect(entryIds()).toEqual(["u-8", "u-9", "u-10"]);
		},
	);

	it("does not reinsert an old page after the same session's history was reset", async () => {
		setActiveSession();
		seedWindow([userEntry("old-tail", "before edit")], { nextBeforeEntry: "c1", hasMore: true });
		const older = deferred<HistoryPage>();
		openViewer.mockReturnValueOnce(older.promise).mockResolvedValueOnce(page([userEntry("new-tail", "after edit")]));
		const load = loadOlderTranscriptPage();
		await resetTranscriptWindowToTail();
		older.resolve(page([userEntry("old-page", "outdated")], { head: false }));
		expect(await load).toBe(0);
		expect(entryIds()).toEqual(["new-tail"]);
	});

	it("向 openViewer 回传游标、前插旧页并前移 firstItemIndex", async () => {
		setActiveSession();
		seedWindow([userEntry("u-9", "q9"), agentEntry("a-9", "a9")], {
			nextBeforeEntry: "cursor-1",
			hasMore: true,
		});
		openViewer.mockResolvedValue(
			page([userEntry("u-8", "q8"), agentEntry("a-8", "a8")], {
				nextBeforeEntry: "cursor-0",
				hasMore: true,
				head: false,
			}),
		);

		const prepended = await loadOlderTranscriptPage();
		expect(prepended).toBe(2);
		expect(openViewer).toHaveBeenCalledWith(SESSION_PATH, { beforeEntry: "cursor-1" });
		expect(entryIds()).toEqual(["u-8", "a-8", "u-9", "a-9"]);
		const state = store.get(transcriptWindowStateAtom);
		expect(state.firstItemIndex).toBe(TRANSCRIPT_WINDOW_FIRST_INDEX - 2);
		expect(state.hasMore).toBe(true);
		const backlog = readTranscriptBacklog(SESSION_PATH);
		expect(backlog?.entries.map(entryIdOf)).toEqual(["u-8", "a-8", "u-9", "a-9"]);
		expect(backlog?.nextBeforeEntry).toBe("cursor-0");
	});

	it("到头（hasMore=false）后不取页；重复并发调用被在途守卫拦截", async () => {
		setActiveSession();
		seedWindow([userEntry("u-9", "q9")], { hasMore: false });
		expect(await loadOlderTranscriptPage()).toBe(0);
		expect(openViewer).not.toHaveBeenCalled();

		// 有下一页时，并发第二次调用返回 0 且不再发请求。
		seedWindow([userEntry("u-9", "q9")], { nextBeforeEntry: "c1", hasMore: true });
		const slow = deferred<HistoryPage>();
		openViewer.mockReturnValue(slow.promise);
		const first = loadOlderTranscriptPage();
		expect(await loadOlderTranscriptPage()).toBe(0);
		expect(openViewer).toHaveBeenCalledTimes(1);
		slow.resolve(page([userEntry("u-8", "q8")], { head: false }));
		await first;
	});

	it("stale 游标 → 保留可见内容并回退 head 页对账", async () => {
		setActiveSession();
		seedWindow([userEntry("u-9", "q9"), agentEntry("a-9", "a9")], {
			nextBeforeEntry: "c-stale",
			hasMore: true,
		});
		openViewer.mockResolvedValueOnce({ stale: true }).mockResolvedValueOnce(
			page([userEntry("u-9", "q9"), agentEntry("a-9", "a9"), userEntry("u-10", "q10")], {
				nextBeforeEntry: "c-new",
				hasMore: true,
			}),
		);
		const prepended = await loadOlderTranscriptPage();
		expect(prepended).toBe(0);
		expect(openViewer).toHaveBeenNthCalledWith(2, SESSION_PATH, {});
		// head 页对账延展窗口末端：新条目进来，旧窗口内容仍在。
		expect(entryIds()).toEqual(["u-9", "a-9", "u-10"]);
		expect(store.get(transcriptWindowStateAtom).firstItemIndex).toBe(TRANSCRIPT_WINDOW_FIRST_INDEX);
	});

	it("await 期间切走会话：旧页响应不落库", async () => {
		setActiveSession();
		seedWindow([userEntry("u-9", "q9")], { nextBeforeEntry: "c1", hasMore: true });
		const slow = deferred<HistoryPage>();
		openViewer.mockReturnValue(slow.promise);
		const pending = loadOlderTranscriptPage();
		// 会话切换（opener 会清空 messages 并 reset 窗口态）。
		setActiveSession("/sessions/b.jsonl");
		store.set(chatMessagesAtom, []);
		resetTranscriptWindowState();
		slow.resolve(page([userEntry("u-8", "q8")], { head: false }));
		expect(await pending).toBe(0);
		expect(store.get(chatMessagesAtom)).toHaveLength(0);
		expect(readTranscriptBacklog(SESSION_PATH)?.entries).toHaveLength(1);
	});
});

describe("refreshTranscriptTail", () => {
	it("append-only：head 页延展窗口末端，已加载旧页保留、游标不动", async () => {
		setActiveSession();
		seedWindow([userEntry("u-8", "q8"), userEntry("u-9", "q9"), agentEntry("a-9", "a9")], {
			nextBeforeEntry: "c0",
			hasMore: true,
		});
		openViewer.mockResolvedValue(
			page([
				userEntry("u-9", "q9"),
				agentEntry("a-9", "a9"),
				userEntry("u-9b", "q9b"),
				agentEntry("a-9b", "a9 cont"),
			]),
		);
		expect(await refreshTranscriptTail()).toBe(true);
		expect(entryIds()).toEqual(["u-8", "u-9", "a-9", "u-9b", "a-9b"]);
		expect(readTranscriptBacklog(SESSION_PATH)?.nextBeforeEntry).toBe("c0");
	});

	it("页无变化 → unchanged 短路，chatMessages 引用不被替换", async () => {
		setActiveSession();
		seedWindow([userEntry("u-9", "q9"), agentEntry("a-9", "a9")], { nextBeforeEntry: "c0", hasMore: true });
		const before = store.get(chatMessagesAtom);
		openViewer.mockResolvedValue(page([userEntry("u-9", "q9"), agentEntry("a-9", "a9")]));
		expect(await refreshTranscriptTail()).toBe(true);
		expect(store.get(chatMessagesAtom)).toBe(before);
	});

	it("窗口内改写 → replaced：整窗收敛为 head 页", async () => {
		setActiveSession();
		seedWindow([userEntry("u-8", "q8"), userEntry("u-9", "q9"), agentEntry("a-9", "a9")], {
			nextBeforeEntry: "c0",
			hasMore: true,
		});
		openViewer.mockResolvedValue(
			page([userEntry("u-9x", "q9 edited"), agentEntry("a-9", "a9")], { nextBeforeEntry: "c1" }),
		);
		expect(await refreshTranscriptTail()).toBe(true);
		expect(entryIds()).toEqual(["u-9x", "a-9"]);
		expect(readTranscriptBacklog(SESSION_PATH)?.entries.map(entryIdOf)).toEqual(["u-9x", "a-9"]);
		expect(readTranscriptBacklog(SESSION_PATH)?.nextBeforeEntry).toBe("c1");
	});

	it("无 backlog 或 unbounded 会话返回 false（调用方走旧全量路径）", async () => {
		setActiveSession();
		expect(await refreshTranscriptTail()).toBe(false);
		const projected = fullHistoryToChatWithSpans([userEntry("u-1", "q1")], RUNTIME_ID);
		commitTranscriptWindow(SESSION_PATH, {
			entries: projected.messages.length ? [userEntry("u-1", "q1")] : [],
			spans: projected.spans,
			unbounded: true,
		});
		expect(await refreshTranscriptTail()).toBe(false);
		expect(openViewer).not.toHaveBeenCalled();
	});

	it("shouldCommit 闸门为否时不写库（跨轮历史回流丢弃）", async () => {
		setActiveSession();
		seedWindow([userEntry("u-9", "q9")], { nextBeforeEntry: "c0", hasMore: true });
		openViewer.mockResolvedValue(page([userEntry("u-9", "q9"), agentEntry("a-9", "a9")]));
		expect(await refreshTranscriptTail({ shouldCommit: () => false })).toBe(true);
		expect(entryIds()).toEqual(["u-9"]);
	});

	it("patchCanonical 计时补丁落到 canonical 末条 agent item", async () => {
		setActiveSession();
		seedWindow([userEntry("u-9", "q9"), agentEntry("a-9", "a9")], { nextBeforeEntry: "c0", hasMore: true });
		openViewer.mockResolvedValue(page([userEntry("u-9", "q9"), agentEntry("a-9", "a9"), agentEntry("a-10", "a10")]));
		await refreshTranscriptTail({
			patchCanonical: (items) => {
				const mapped = items.slice();
				for (let i = mapped.length - 1; i >= 0; i--) {
					const message = mapped[i];
					if (message?.kind === "agent") {
						mapped[i] = { ...message, durationSeconds: 7 };
						break;
					}
				}
				return mapped;
			},
		});
		const tail = store.get(chatMessagesAtom).at(-1);
		expect(tail?.kind === "agent" ? tail.durationSeconds : undefined).toBe(7);
	});

	it("窗口化刷新不打散占位：占位 item 对象身份保留", async () => {
		setActiveSession();
		const entries = [userEntry("u-9", "q9"), agentEntry("a-9", "a9")];
		seedWindow(entries, { nextBeforeEntry: "c0", hasMore: true });
		const backlog = readTranscriptBacklog(SESSION_PATH);
		// 视口只含末尾 → 头部 user 降级为占位。
		const applied = applyTranscriptWindow(store.get(chatMessagesAtom), { startIndex: 1, endIndex: 1 }, backlog, {});
		store.set(chatMessagesAtom, applied?.items ?? []);
		const placeholder = store.get(chatMessagesAtom)[0];
		expect(placeholder?.kind).toBe("placeholder");

		openViewer.mockResolvedValue(page([...entries, userEntry("u-10", "q10"), agentEntry("a-10", "a10")]));
		await refreshTranscriptTail();
		expect(store.get(chatMessagesAtom)[0]).toBe(placeholder);
		expect(entryIds()).toEqual(["u-9", "a-9", "u-10", "a-10"]);
	});
});

describe("resetTranscriptWindowToTail", () => {
	it("整窗重置为 head 页并复位 firstItemIndex", async () => {
		setActiveSession();
		seedWindow([userEntry("u-7", "q7"), userEntry("u-8", "q8"), agentEntry("a-8", "a8")], {
			nextBeforeEntry: "c0",
			hasMore: true,
		});
		store.set(transcriptWindowStateAtom, (prev) => ({ ...prev, firstItemIndex: TRANSCRIPT_WINDOW_FIRST_INDEX - 5 }));
		openViewer.mockResolvedValue(page([agentEntry("a-8", "a8"), userEntry("u-9", "q9")], { hasMore: true }));
		expect(await resetTranscriptWindowToTail()).toBe(true);
		expect(entryIds()).toEqual(["a-8", "u-9"]);
		expect(store.get(transcriptWindowStateAtom).firstItemIndex).toBe(TRANSCRIPT_WINDOW_FIRST_INDEX);
	});

	it("unbounded backlog → false（回落旧路径）", async () => {
		setActiveSession();
		commitTranscriptWindow(SESSION_PATH, { entries: [userEntry("u-1", "q1")], spans: new Map(), unbounded: true });
		expect(await resetTranscriptWindowToTail()).toBe(false);
		expect(openViewer).not.toHaveBeenCalled();
	});
});

describe("drainActiveTranscriptWindow", () => {
	it("沿游标逐页拉到底并物化占位；导出看到的是完整 transcript", async () => {
		setActiveSession();
		seedWindow([userEntry("u-2", "q2"), agentEntry("a-2", "a2")], {
			nextBeforeEntry: "c1",
			hasMore: true,
		});
		// 头部 user 先降级成占位，drain 后要物化回完整消息。
		const backlog = readTranscriptBacklog(SESSION_PATH);
		const applied = applyTranscriptWindow(store.get(chatMessagesAtom), { startIndex: 1, endIndex: 1 }, backlog, {});
		store.set(chatMessagesAtom, applied?.items ?? []);
		expect(store.get(chatMessagesAtom)[0]?.kind).toBe("placeholder");

		openViewer
			.mockResolvedValueOnce(
				page([userEntry("u-1", "q1"), agentEntry("a-1", "a1")], {
					nextBeforeEntry: "c0",
					hasMore: true,
					head: false,
				}),
			)
			.mockResolvedValueOnce(page([userEntry("u-0", "q0")], { hasMore: false, head: false }));

		expect(await drainActiveTranscriptWindow()).toBe(true);
		expect(openViewer).toHaveBeenCalledTimes(2);
		expect(entryIds()).toEqual(["u-0", "u-1", "a-1", "u-2", "a-2"]);
		expect(store.get(chatMessagesAtom).every((m) => m.kind !== "placeholder")).toBe(true);
		expect(store.get(transcriptWindowStateAtom).hasMore).toBe(false);
	});

	it("unbounded 会话无需翻页即返回 true；无 backlog 返回 false", async () => {
		setActiveSession();
		commitTranscriptWindow(SESSION_PATH, {
			entries: [userEntry("u-1", "q1")],
			spans: new Map(),
			unbounded: true,
		});
		expect(await drainActiveTranscriptWindow()).toBe(true);
		expect(openViewer).not.toHaveBeenCalled();

		clearTranscriptBacklog();
		expect(await drainActiveTranscriptWindow()).toBe(false);
	});
});

describe("窗口化乐观气泡", () => {
	it("尾页对账：未决乐观气泡作为 live-only 尾部保留；落盘后由 canonical 吸收", async () => {
		setActiveSession();
		seedWindow([userEntry("u-9", "q9")], { nextBeforeEntry: "c0", hasMore: true });
		const optimistic = createConversationUserMessage({ id: "opt-1", text: "pending q", deliveryPhase: "pending" });
		rememberOptimisticUserMessage(RUNTIME_ID, optimistic, [userEntry("u-9", "q9") as never]);
		// 把乐观气泡挂到 live 尾部（模拟发送路径）。
		store.set(chatMessagesAtom, (prev) => [...prev, optimistic]);

		// head 页尚未包含它 → 延展后仍在尾部。
		openViewer.mockResolvedValue(page([userEntry("u-9", "q9"), agentEntry("a-9", "a9")]));
		await refreshTranscriptTail();
		expect(store.get(chatMessagesAtom).map((m) => m.id)).toEqual([expect.any(String), expect.any(String), "opt-1"]);
		expect(entryIds()).toEqual(["u-9", "a-9", undefined]);

		// 下一轮：canonical 落盘 → 乐观气泡被吸收，不重复出现。
		openViewer.mockResolvedValue(
			page([userEntry("u-9", "q9"), agentEntry("a-9", "a9"), userEntry("u-10", "pending q")]),
		);
		await refreshTranscriptTail();
		const ids = store.get(chatMessagesAtom).map((m) => m.id);
		expect(ids.filter((id) => id === "opt-1")).toHaveLength(0);
		expect(entryIds()).toEqual(["u-9", "a-9", "u-10"]);
	});

	it("尾部 pending 幽灵使镜像气泡对位落空时，气泡仍锚定在它触发的回复之前", async () => {
		// 镜像气泡之后又有消息入队未消费：pending 数与尾部 user 数错位对齐，
		// 镜像对位到错误的 canonical user 上保持未决；窗口化提交若把未决
		// live-only 项平铺到尾部，它会跑到 canonical 回复之后（BUG-0068）。
		setActiveSession();
		seedWindow([userEntry("u-9", "q9")], { nextBeforeEntry: "c0", hasMore: true });
		const mirror = createConversationUserMessage({ id: "opt-m", text: "插队消息", deliveryPhase: "pending" });
		const ghost = createConversationUserMessage({ id: "opt-x", text: "其后排队", deliveryPhase: "pending" });
		rememberOptimisticUserMessage(RUNTIME_ID, mirror, store.get(chatMessagesAtom), { matchTextOnly: true });
		rememberOptimisticUserMessage(RUNTIME_ID, ghost, [...store.get(chatMessagesAtom), mirror], {
			matchTextOnly: true,
		});
		const replyDraft = createConversationAgentMessage({ id: "draft-reply", phase: "streaming", blocks: [] });
		store.set(chatMessagesAtom, [...store.get(chatMessagesAtom), mirror, replyDraft]);

		// 规范尾部已含被消费消息与它的回复；尾部对齐把镜像错配到 u-9。
		openViewer.mockResolvedValue(
			page([userEntry("u-9", "q9"), userEntry("u-10", "插队消息"), agentEntry("a-10", "回复")]),
		);
		await refreshTranscriptTail();

		const ids = store.get(chatMessagesAtom).map((m) => m.id);
		const mirrorIndex = ids.indexOf("opt-m");
		const replyIndex = store.get(chatMessagesAtom).findIndex((m) => "entryId" in m && m.entryId === "a-10");
		expect(mirrorIndex).toBeGreaterThanOrEqual(0);
		expect(replyIndex).toBeGreaterThanOrEqual(0);
		expect(mirrorIndex).toBeLessThan(replyIndex);
	});
});
