// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	AutomaticExtractionRunner,
	classifyExtractionError,
	ExtractionBudgetExhaustedError,
	type ExtractionSuggestion,
	type ExtractorPort,
	InvalidExtractionOutputError,
	mergeSuggestions,
	validateSuggestion,
} from "../../src/memory/extraction/index.js";

/**
 * TASK-0380 自动抽取合同（确定性替身驱动，无真实 Provider）：预算约束、
 * 错误分类、建议校验（scope/revision/证据等级）、去重合并、NOOP 区分。
 */

function suggestion(overrides: Partial<ExtractionSuggestion> = {}): ExtractionSuggestion {
	return {
		action: "ADD",
		content: "项目使用 bun run check",
		scopeName: "project",
		evidence: "claimed",
		sourceId: "session/t1/user",
		...overrides,
	};
}

const BUDGET = { model: "test/extractor", maxOutputTokens: 400, dailyRequestLimit: 2 };

describe("建议校验（validateSuggestion）", () => {
	it("越权 scope 降为 NOOP；空内容 ADD 降为 NOOP", () => {
		const context = { allowedScopes: ["user"], currentRevisions: new Map<string, number>() };
		expect(validateSuggestion(suggestion({ scopeName: "project" }), context).action).toBe("NOOP");
		expect(validateSuggestion(suggestion({ content: "  " }), { ...context, allowedScopes: ["project"] }).action).toBe(
			"NOOP",
		);
	});

	it("REVISE/RETRACT 必须匹配当前 revision；不匹配降 NOOP", () => {
		const context = {
			allowedScopes: ["project"],
			currentRevisions: new Map([["mem-1", 3]]),
		};
		const stale = validateSuggestion(
			suggestion({ action: "REVISE", targetMemoryId: "mem-1", expectedRevision: 2, content: "更新" }),
			context,
		);
		expect(stale.action).toBe("NOOP");
		const fresh = validateSuggestion(
			suggestion({ action: "REVISE", targetMemoryId: "mem-1", expectedRevision: 3, content: "更新" }),
			context,
		);
		expect(fresh.action).toBe("REVISE");
		expect(validateSuggestion(suggestion({ action: "RETRACT", targetMemoryId: "mem-x" }), context).action).toBe(
			"NOOP",
		);
	});

	it("自动抽取不授予高证据等级：tool-verified 一律降 claimed", () => {
		const context = { allowedScopes: ["project"], currentRevisions: new Map<string, number>() };
		const result = validateSuggestion(suggestion({ evidence: "tool-verified" }), context);
		expect(result.evidence).toBe("claimed");
	});
});

describe("去重合并（mergeSuggestions）", () => {
	it("同 action+scope+content 只留一条；NOOP 全部丢弃", () => {
		const merged = mergeSuggestions([
			suggestion(),
			suggestion({ sourceId: "session/t2/user" }),
			suggestion({ action: "NOOP" }),
			suggestion({ content: "另一条" }),
		]);
		expect(merged).toHaveLength(2);
	});
});

describe("预算与错误分类", () => {
	it("日预算耗尽抛 budget-exhausted；分类稳定", () => {
		const extractor: ExtractorPort = { extract: async () => [] };
		const runner = new AutomaticExtractionRunner({
			extractor,
			budget: BUDGET,
			allowedScopes: ["project"],
			now: () => ({ iso: "2026-10-22T00:00:00Z", day: "2026-10-22" }),
		});
		expect(classifyExtractionError(new ExtractionBudgetExhaustedError())).toBe("budget-exhausted");
		expect(classifyExtractionError(new InvalidExtractionOutputError("x"))).toBe("invalid-output");
		expect(classifyExtractionError(new Error("timeout"))).toBe("provider-transient");
		// 两次请求耗尽日限。
		void runner.run({ payload: "a" }, { currentRevisions: new Map() });
		void runner.run({ payload: "b" }, { currentRevisions: new Map() });
		expect(runner.run({ payload: "c" }, { currentRevisions: new Map() })).rejects.toThrowError(
			ExtractionBudgetExhaustedError,
		);
	});
});

describe("AutomaticExtractionRunner（确定性替身）", () => {
	it("完整流程：抽取→输出校验→建议校验→合并；推测性文本不升证据", async () => {
		const extractor: ExtractorPort = {
			extract: async () => [
				suggestion({ content: "事实一" }),
				suggestion({ content: "事实一", sourceId: "s2" }),
				suggestion({ content: "越权", scopeName: "user" }),
				suggestion({ evidence: "tool-verified", content: "事实三" }),
			],
		};
		const runner = new AutomaticExtractionRunner({
			extractor,
			budget: { model: "test/extractor", maxOutputTokens: 1000 },
			allowedScopes: ["project"],
		});
		const suggestions = await runner.run({ payload: "payload" }, { currentRevisions: new Map() });
		expect(suggestions.map((entry) => entry.content)).toEqual(["事实一", "事实三"]);
		expect(suggestions.every((entry) => entry.evidence === "claimed")).toBe(true);
	});

	it("输出条目超单 job 上限抛 invalid-output", async () => {
		const extractor: ExtractorPort = {
			extract: async () => Array.from({ length: 30 }, (_, i) => suggestion({ content: `条目${i}` })),
		};
		const runner = new AutomaticExtractionRunner({
			extractor,
			budget: { model: "test/extractor", maxOutputTokens: 400 },
			allowedScopes: ["project"],
		});
		await expect(runner.run({ payload: "x" }, { currentRevisions: new Map() })).rejects.toThrowError(
			InvalidExtractionOutputError,
		);
	});
});
