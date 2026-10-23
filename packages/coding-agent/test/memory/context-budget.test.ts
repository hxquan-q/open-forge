// Modified by The Open Forge contributors.

import type { MemoryRevision } from "@vetta/runtime-memory";
import { describe, expect, it } from "vitest";
import {
	allocateInjection,
	DEFAULT_INJECTION_BUDGET,
	resolveEffectiveBudget,
} from "../../src/memory/context/injection-budget.js";

/**
 * TASK-0382 注入预算合同：pin 占预算、scope 保底、上下文余量收缩、
 * 条数/字符双上限。
 */

function revision(overrides: Partial<MemoryRevision> = {}): MemoryRevision {
	return {
		memoryId: "mem-x",
		revisionId: "rev-x",
		kind: "fact",
		content: "内容",
		scopeName: "project",
		status: "active",
		validFrom: "2026-01-01T00:00:00Z",
		validTo: "",
		recordedAt: "2026-01-01T00:00:00Z",
		supersedes: "",
		evidence: "claimed",
		...overrides,
	};
}

describe("注入预算", () => {
	it("pin 稳定在前并占预算；动态召回填充余量", () => {
		const pinned = [revision({ memoryId: "pin-1", content: "固定偏好", pinned: true })];
		const dynamic = [
			revision({ memoryId: "dyn-1", content: "动态一" }),
			revision({ memoryId: "dyn-2", content: "动态二" }),
		];
		const result = allocateInjection({ pinned, dynamic });
		expect(result[0]?.memoryId).toBe("pin-1");
		expect(result.map((entry) => entry.memoryId)).toContain("dyn-1");
	});

	it("全局偏好不挤掉全部项目证据：各 scope 保底 2 条", () => {
		const dynamic = [
			revision({ memoryId: "u1", scopeName: "user", content: "用户一" }),
			revision({ memoryId: "u2", scopeName: "user", content: "用户二" }),
			revision({ memoryId: "u3", scopeName: "user", content: "用户三" }),
			revision({ memoryId: "p1", scopeName: "project", content: "项目一" }),
		];
		const result = allocateInjection({ pinned: [], dynamic, budget: { maxEntries: 4, maxChars: 500 } });
		expect(result.map((entry) => entry.scopeName)).toContain("project");
		expect(result.map((entry) => entry.memoryId)).toContain("u1");
		expect(result.map((entry) => entry.memoryId)).toContain("p1");
	});

	it("条数与字符双上限生效", () => {
		const dynamic = Array.from({ length: 12 }, (_, i) =>
			revision({ memoryId: `m${i}`, content: `${i}${"长".repeat(300)}` }),
		);
		const result = allocateInjection({ pinned: [], dynamic, budget: { maxEntries: 8, maxChars: 1000 } });
		expect(result.length).toBeLessThanOrEqual(8);
		expect(result.reduce((sum, entry) => sum + entry.content.length, 0)).toBeLessThanOrEqual(1000);
	});

	it("上下文余量收缩预算：取注入初值与剩余字符较小值", () => {
		expect(resolveEffectiveBudget(DEFAULT_INJECTION_BUDGET, undefined)).toEqual(DEFAULT_INJECTION_BUDGET);
		expect(resolveEffectiveBudget(DEFAULT_INJECTION_BUDGET, 500)?.maxChars).toBe(500);
		expect(resolveEffectiveBudget(DEFAULT_INJECTION_BUDGET, 2000)).toEqual(DEFAULT_INJECTION_BUDGET);
		expect(resolveEffectiveBudget(DEFAULT_INJECTION_BUDGET, 0)?.maxChars).toBe(0);
	});
});
