// Copyright The Open Forge contributors.
import type { HistoryEntry } from "@vetta/runtime-core";
import { describe, expect, it } from "vitest";
import {
	diffViewerHistory,
	HISTORY_PAGE_DEFAULT_LIMIT,
	HISTORY_PAGE_MAX_LIMIT,
	sliceHistoryPage,
} from "./session-history-page.js";

function message(id: string, role: "user" | "assistant" = "assistant"): HistoryEntry {
	return {
		type: "message",
		entryId: id,
		message: { role, content: `text-${id}` } as never,
	};
}

function timing(id: string): HistoryEntry {
	return { type: "assistant_turn_timing", timing: { startedAt: 1, endedAt: 2, durationMs: 1 }, timestamp: id };
}

function historyOf(count: number, prefix = "e"): HistoryEntry[] {
	return Array.from({ length: count }, (_, i) => message(`${prefix}${i}`));
}

function entryId(entry: HistoryEntry | undefined): string | undefined {
	return (entry as { entryId?: string } | undefined)?.entryId;
}

describe("sliceHistoryPage（TASK-0050 游标分页合同）", () => {
	it("默认请求返回最新 100 条尾页并给出向更旧翻页的游标", () => {
		const history = historyOf(250);
		const page = sliceHistoryPage(history);
		if ("stale" in page) throw new Error("unexpected stale");

		expect(page.history).toHaveLength(HISTORY_PAGE_DEFAULT_LIMIT);
		expect(entryId(page.history.at(-1))).toBe("e249");
		expect(entryId(page.history[0])).toBe("e150");
		expect(page.hasMore).toBe(true);
		expect(page.head).toBe(true);
		expect(page.nextBeforeEntry).toBeTypeOf("string");
	});

	it("连续翻页旧→新无重漏，到头后不再给游标", () => {
		const history = historyOf(250);
		const seen: (string | undefined)[] = [];
		let cursor: string | undefined;

		let page = sliceHistoryPage(history, { limit: 100 });
		while (true) {
			if ("stale" in page) throw new Error("unexpected stale");
			seen.unshift(...page.history.map(entryId));
			cursor = page.nextBeforeEntry;
			if (!cursor) break;
			page = sliceHistoryPage(history, { limit: 100, beforeEntry: cursor });
		}

		expect(seen).toEqual(history.map((entry) => entryId(entry)));
	});

	it("beforeEntry 为排他边界：第二页首条与第一页首条不重叠", () => {
		const history = historyOf(10);
		const first = sliceHistoryPage(history, { limit: 4 });
		if ("stale" in first) throw new Error("stale");
		const second = sliceHistoryPage(history, { limit: 4, beforeEntry: first.nextBeforeEntry });
		if ("stale" in second) throw new Error("stale");

		expect(second.history.map(entryId)).toEqual(["e2", "e3", "e4", "e5"]);
		expect(second.head).toBe(false);
	});

	it("append-only 追加不失效游标；改写边界条目则 stale", () => {
		const history = historyOf(10);
		const first = sliceHistoryPage(history, { limit: 4 });
		if ("stale" in first || !first.nextBeforeEntry) throw new Error("missing cursor");

		// 尾部 append 不触碰游标锚定的边界条目 → 仍有效。
		const appended = [...history, message("new1"), message("new2")];
		const stillValid = sliceHistoryPage(appended, { beforeEntry: first.nextBeforeEntry });
		expect("stale" in stillValid).toBe(false);

		// 分支改写/删除替换掉边界条目 → 签名失配报 stale，不给伪空页。
		const rewritten = [...history];
		rewritten[6] = message("rewritten");
		expect(sliceHistoryPage(rewritten, { beforeEntry: first.nextBeforeEntry })).toEqual({ stale: true });

		const truncated = history.slice(0, 3);
		expect(sliceHistoryPage(truncated, { beforeEntry: first.nextBeforeEntry })).toEqual({ stale: true });
	});

	it("无 entryId 的条目也能锚定游标，内容改写后 stale", () => {
		const history: HistoryEntry[] = [message("a"), timing("t1"), message("b"), message("c")];
		const first = sliceHistoryPage(history, { limit: 2 });
		if ("stale" in first || !first.nextBeforeEntry) throw new Error("missing cursor");

		const second = sliceHistoryPage(history, { limit: 2, beforeEntry: first.nextBeforeEntry });
		if ("stale" in second) throw new Error("stale");
		expect(second.history[0]?.type).toBe("message");

		const rewritten = [...history];
		rewritten[2] = message("b-changed");
		expect(sliceHistoryPage(rewritten, { beforeEntry: first.nextBeforeEntry })).toEqual({ stale: true });
	});

	it("非法游标字符串一律 stale", () => {
		const history = historyOf(5);
		expect(sliceHistoryPage(history, { beforeEntry: "not-a-cursor" })).toEqual({ stale: true });
		expect(sliceHistoryPage(history, { beforeEntry: Buffer.from("e:999:x").toString("base64url") })).toEqual({
			stale: true,
		});
	});

	it("limit 校验：默认 100、上限 200、非整数拒绝", () => {
		const history = historyOf(300);
		expect(() => sliceHistoryPage(history, { limit: 0 })).toThrow(TypeError);
		expect(() => sliceHistoryPage(history, { limit: HISTORY_PAGE_MAX_LIMIT + 1 })).toThrow(TypeError);
		expect(() => sliceHistoryPage(history, { limit: 1.5 })).toThrow(TypeError);
		const page = sliceHistoryPage(history, { limit: HISTORY_PAGE_MAX_LIMIT });
		if ("stale" in page) throw new Error("stale");
		expect(page.history).toHaveLength(HISTORY_PAGE_MAX_LIMIT);
	});

	it("tailTurns 把尾页起点抬到最近 N 个 user turn 开头，且仍受 limit 约束", () => {
		// 构造：head(100) + user0 + 50 条 + user1 + 10 条
		const history: HistoryEntry[] = [
			...historyOf(100, "h"),
			message("u0", "user"),
			...historyOf(50, "m"),
			message("u1", "user"),
			...historyOf(10, "t"),
		];
		const page = sliceHistoryPage(history, { tailTurns: 2 });
		if ("stale" in page) throw new Error("stale");

		// tailTurns 选中 u0 起的 62 条，小于 limit → 整段返回。
		expect(page.history).toHaveLength(62);
		expect(entryId(page.history[0])).toBe("u0");
		expect(page.hasMore).toBe(true);
		expect(page.head).toBe(true);

		// tail 选择超过 limit 时只回尾部 limit 条。
		const longTail: HistoryEntry[] = [message("u0", "user"), ...historyOf(150, "x"), message("old")];
		const bounded = sliceHistoryPage(longTail, { tailTurns: 1, limit: 10 });
		if ("stale" in bounded) throw new Error("stale");
		expect(bounded.history).toHaveLength(10);
		expect(entryId(bounded.history.at(-1))).toBe("old");
	});

	it("空历史返回空页、无游标、hasMore=false", () => {
		const page = sliceHistoryPage([]);
		expect(page).toEqual({ history: [], nextBeforeEntry: undefined, hasMore: false, head: true });
	});
});

describe("diffViewerHistory（TASK-0050 viewer 增量订阅）", () => {
	it("首轮推送回 snapshot 全量", () => {
		const next = historyOf(5);
		expect(diffViewerHistory(null, next)).toEqual({ kind: "snapshot", history: next });
	});

	it("append-only 追加只下发新增条目", () => {
		const prev = historyOf(5);
		const next = [...prev, message("n1"), message("n2")];
		const update = diffViewerHistory(prev, next);
		expect(update).toMatchObject({ kind: "append" });
		if (update?.kind !== "append") throw new Error("not append");
		expect(update.appended.map(entryId)).toEqual(["n1", "n2"]);
	});

	it("内容无变化的写事件返回 null（调用方跳过推送）", () => {
		const prev = historyOf(4);
		expect(diffViewerHistory(prev, [...prev])).toBeNull();
	});

	it("中间改写或截断回 reset + 有界最新页，而非伪增量", () => {
		const prev = historyOf(150);
		const rewritten = [...prev];
		rewritten[40] = message("mutated");
		const update = diffViewerHistory(prev, rewritten);
		if (update?.kind !== "reset") throw new Error("expected reset");
		expect(update.page.history).toHaveLength(HISTORY_PAGE_DEFAULT_LIMIT);
		expect(update.page.head).toBe(true);

		const truncated = prev.slice(0, 10);
		expect(diffViewerHistory(prev, truncated)?.kind).toBe("reset");
	});

	it("无 entryId 条目参与的前缀比较同样可靠", () => {
		const prev: HistoryEntry[] = [message("a"), timing("t1")];
		const appended: HistoryEntry[] = [...prev, message("b")];
		expect(diffViewerHistory(prev, appended)).toMatchObject({ kind: "append" });
		const mutated: HistoryEntry[] = [message("a"), timing("t1-changed"), message("b")];
		expect(diffViewerHistory(prev, mutated)?.kind).toBe("reset");
	});
});
