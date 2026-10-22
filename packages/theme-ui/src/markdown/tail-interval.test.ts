// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { nextTailInterval } from "./MarkdownContent";

describe("nextTailInterval", () => {
	it("小尾块解析便宜时不启用自适应节奏，超过一帧预算时按占空比退避", () => {
		expect(nextTailInterval(0, 0, 5)).toBe(0);
		expect(nextTailInterval(0, 0, 16)).toBe(0);
		// 35ms × 10 = 350ms：小而昂贵的尾块（稠密构造）也受占空比保护。
		expect(nextTailInterval(0, 0, 35)).toBe(350);
	});

	it("解析便宜时维持基础节奏", () => {
		expect(nextTailInterval(200, 200, 5)).toBe(200);
		expect(nextTailInterval(400, 400, 20)).toBe(400);
	});

	it("解析成本超过占空比预算时立即放慢，并受 800ms 上限约束", () => {
		// 32ms × 10 = 320ms > 200ms 基础节奏。
		expect(nextTailInterval(200, 200, 32)).toBe(320);
		// 上限约束：70ms × 10 = 700ms；90ms × 10 = 900ms → 800ms。
		expect(nextTailInterval(200, 320, 70)).toBe(700);
		expect(nextTailInterval(200, 700, 90)).toBe(800);
	});

	it("解析变便宜后逐步恢复，不一次性跌回基础节奏", () => {
		expect(nextTailInterval(200, 700, 10)).toBe(350);
		expect(nextTailInterval(200, 350, 10)).toBe(200);
		// 目标仍高于当前一半时不回退，避免抖动。
		expect(nextTailInterval(200, 320, 25)).toBe(320);
	});

	it("基础节奏升档时以较高者为准", () => {
		expect(nextTailInterval(400, 200, 10)).toBe(400);
	});
});
