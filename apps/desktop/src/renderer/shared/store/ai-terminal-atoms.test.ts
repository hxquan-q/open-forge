// Modified by The Open Forge contributors.
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import {
	type AiTerminalEntry,
	aiTerminalCommandFromToolCall,
	aiTerminalFeedAtom,
	aiTerminalOutputFromResult,
	aiTerminalTeamKey,
	markAiTerminalEntryDone,
	pushAiTerminalEntry,
} from "./ai-terminal-atoms";

function runningEntry(overrides: Partial<AiTerminalEntry> = {}): AiTerminalEntry {
	return { command: "bun test", key: "call-1", running: true, at: 1, cwd: "/repo", ...overrides };
}

describe("aiTerminalCommandFromToolCall", () => {
	it("bash/shell 的 command 参数 → 去空白命令文本", () => {
		expect(aiTerminalCommandFromToolCall("bash", { command: "  bun run check  " })).toBe("bun run check");
		expect(aiTerminalCommandFromToolCall("shell", { command: "git status" })).toBe("git status");
		expect(aiTerminalCommandFromToolCall("bash", { command: "ls", timeout: 30 })).toBe("ls");
	});

	it("非 shell 工具、空命令、参数异常一律 null（表现为不投屏）", () => {
		expect(aiTerminalCommandFromToolCall("edit", { command: "rm -rf /" })).toBeNull();
		expect(aiTerminalCommandFromToolCall("read", {})).toBeNull();
		expect(aiTerminalCommandFromToolCall("bash", { command: "   " })).toBeNull();
		expect(aiTerminalCommandFromToolCall("bash", { command: 42 })).toBeNull();
		expect(aiTerminalCommandFromToolCall("bash", null)).toBeNull();
		expect(aiTerminalCommandFromToolCall(undefined, { command: "ls" })).toBeNull();
	});
});

describe("aiTerminalOutputFromResult", () => {
	it("RuntimeToolResult：拼接全部文本块，跳过图片块", () => {
		const result = {
			content: [
				{ type: "text", text: "line 1" },
				{ type: "image", data: "..." },
				{ type: "text", text: "line 2" },
			],
		};
		expect(aiTerminalOutputFromResult(result)).toBe("line 1\nline 2");
	});

	it("纯字符串 result 兼容；空/无文本/非对象返回 undefined", () => {
		expect(aiTerminalOutputFromResult("raw output")).toBe("raw output");
		expect(aiTerminalOutputFromResult(undefined)).toBeUndefined();
		expect(aiTerminalOutputFromResult(null)).toBeUndefined();
		expect(aiTerminalOutputFromResult({ content: [] })).toBeUndefined();
		expect(aiTerminalOutputFromResult({ content: [{ type: "image", data: "..." }] })).toBeUndefined();
		expect(aiTerminalOutputFromResult({ content: [{ type: "text", text: "  \n" }] })).toBeUndefined();
		expect(aiTerminalOutputFromResult(123)).toBeUndefined();
	});

	it("超长输出截断到 2048 字符", () => {
		expect(aiTerminalOutputFromResult({ content: [{ type: "text", text: "x".repeat(5000) }] })).toHaveLength(2048);
	});

	it("单块超预算内容正确：只取前缀，与整串截断一致", () => {
		const text = "A".repeat(2048) + "B".repeat(3000);
		expect(aiTerminalOutputFromResult({ content: [{ type: "text", text }] })).toBe("A".repeat(2048));
	});

	it("多块拼接与整串 join 后截断逐字符一致（预算含分隔符）", () => {
		const a = "x".repeat(2000);
		const b = "y".repeat(100);
		const joined = `${a}\n${b}`.slice(0, 2048);
		expect(
			aiTerminalOutputFromResult({
				content: [
					{ type: "text", text: a },
					{ type: "text", text: b },
				],
			}),
		).toBe(joined);
	});

	it("预算耗尽后不再读取后续块", () => {
		const full = `${"x".repeat(2048)}\nnever`;
		const result = {
			content: [
				{ type: "text", text: "x".repeat(3000) },
				{ type: "text", text: "tail-block" },
			],
		};
		expect(aiTerminalOutputFromResult(result)).toBe(full.slice(0, 2048));
	});
});

describe("feed 写入", () => {
	it("push 追加条目；同 key 幂等；超限丢最旧", () => {
		const store = createStore();
		pushAiTerminalEntry(store, runningEntry({ key: "a" }));
		pushAiTerminalEntry(store, runningEntry({ key: "b", command: "git status" }));
		expect(store.get(aiTerminalFeedAtom).map((e) => e.key)).toEqual(["a", "b"]);

		pushAiTerminalEntry(store, runningEntry({ key: "a", command: "重复事件" }));
		expect(store.get(aiTerminalFeedAtom).map((e) => e.command)).toEqual(["bun test", "git status"]);

		for (let i = 0; i < 120; i++) {
			pushAiTerminalEntry(store, runningEntry({ key: `k-${i}` }));
		}
		const feed = store.get(aiTerminalFeedAtom);
		expect(feed).toHaveLength(100);
		expect(feed[0]?.key).toBe("k-20");
	});

	it("mark 配对完成写入输出；未知 key 与重复 end 均为 no-op（保持原数组）", () => {
		const store = createStore();
		pushAiTerminalEntry(store, runningEntry({ key: "a" }));
		markAiTerminalEntryDone(store, "a", "done output");
		expect(store.get(aiTerminalFeedAtom)).toEqual([
			{ command: "bun test", key: "a", running: false, at: 1, cwd: "/repo", output: "done output" },
		]);

		const afterFirst = store.get(aiTerminalFeedAtom);
		markAiTerminalEntryDone(store, "a", "again");
		markAiTerminalEntryDone(store, "unknown", "x");
		expect(store.get(aiTerminalFeedAtom)).toBe(afterFirst);
	});

	it("mark 惰性提取：命中 running 才调用提取器，未知/已完成 key 不提取", () => {
		const store = createStore();
		pushAiTerminalEntry(store, runningEntry({ key: "a" }));
		let calls = 0;
		const extract = () => {
			calls += 1;
			return "done";
		};
		markAiTerminalEntryDone(store, "a", extract);
		expect(store.get(aiTerminalFeedAtom)[0]?.output).toBe("done");
		expect(calls).toBe(1);

		markAiTerminalEntryDone(store, "a", extract);
		markAiTerminalEntryDone(store, "unknown", extract);
		expect(calls).toBe(1);
		expect(store.get(aiTerminalFeedAtom)[0]?.output).toBe("done");
	});
});

describe("aiTerminalTeamKey", () => {
	it("会话前缀 + toolCallId，start/end 两侧同键配对", () => {
		expect(aiTerminalTeamKey("conv-1", "call-9")).toBe("conv-1:call-9");
	});
});
