// Modified by The Open Forge contributors.

import type { StoredSessionEvent } from "@vetta/runtime-core/kernel";
import { describe, expect, it } from "vitest";
import { extractCaptureCandidates, shouldEnqueue } from "../../src/memory/capture/index.js";

/**
 * TASK-0379 捕获 Observer 合同（纯函数）：合法来源提取（user 文本/助手
 * 最终可见正文/经许可 tool outcome 引用），排除 thinking/系统指令/二进制，
 * 入队过滤有界。
 */

function messageEvent(id: string, role: string, content: unknown): StoredSessionEvent {
	return { type: "message.appended", turnId: "t1", message: { id, role, content } } as unknown as StoredSessionEvent;
}

describe("捕获候选提取", () => {
	it("user 与助手最终可见文本成为候选；thinking/系统指令被排除", () => {
		const events = [
			messageEvent("m1", "user", "请记住项目用 pnpm"),
			messageEvent("m2", "assistant", [{ type: "text", text: "已保存" }]),
			messageEvent("m3", "assistant", [{ type: "thinking", text: "内部推理不捕获" }]),
			messageEvent("m4", "system", "系统指令不捕获"),
		];
		const candidates = extractCaptureCandidates(events, { extractorVersion: "v1" });
		expect(candidates.map((candidate) => candidate.role)).toEqual(["user-input", "assistant-output"]);
		expect(candidates[0]?.text).toBe("请记住项目用 pnpm");
		expect(candidates[1]?.text).toBe("已保存");
	});

	it("tool outcome 引用默认不捕获；显式允许时仅登记引用型候选", () => {
		const turnDone = { type: "turn.completed", turnId: "tt" } as unknown as StoredSessionEvent;
		expect(extractCaptureCandidates([turnDone], { extractorVersion: "v1" })).toEqual([]);
		const allowed = extractCaptureCandidates([turnDone], { extractorVersion: "v1", allowToolOutcomes: true });
		expect(allowed).toHaveLength(1);
		expect(allowed[0]?.sourceId).toBe("session/turn/tt/outcome-ref");
	});

	it("入队过滤：空文本与超长文本不入队；引用型候选放行", () => {
		expect(shouldEnqueue({ sourceId: "s", cursor: "c", role: "user-input", text: "" })).toBe(false);
		expect(shouldEnqueue({ sourceId: "s", cursor: "c", role: "user-input", text: "x".repeat(9_000) })).toBe(false);
		expect(shouldEnqueue({ sourceId: "s", cursor: "c", role: "user-input", text: "正常" })).toBe(true);
		expect(shouldEnqueue({ sourceId: "s", cursor: "c", role: "tool-outcome", text: "" })).toBe(true);
	});

	it("候选 sourceId 稳定（幂等键基础）", () => {
		const first = extractCaptureCandidates([messageEvent("m1", "user", "a")], { extractorVersion: "v1" });
		const second = extractCaptureCandidates([messageEvent("m1", "user", "a")], { extractorVersion: "v1" });
		expect(first[0]?.sourceId).toBe("session/t1/user");
		expect(first[0]?.sourceId).toBe(second[0]?.sourceId);
	});
});
