// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { FIXTURE_ERASURE_EMPTY, FIXTURE_ERASURE_WITH_SUPPRESSION } from "../src/fixtures.js";
import {
	assertErasureEpochFresh,
	assertExpectedRevision,
	assertNotSuppressed,
	isSuppressed,
	MEMORY_CONTRACT_ERROR_CODES,
	MemoryContractError,
	parseMemoryWriteCommand,
} from "../src/index.js";

describe("修订并发（expectedRevision）合同", () => {
	it("版本一致时通过", () => {
		expect(() => assertExpectedRevision(3, 3)).not.toThrow();
	});

	it("版本不符报 REVISION_CONFLICT，错误信息含两侧版本号", () => {
		try {
			assertExpectedRevision(2, 5);
			expect.unreachable("应当抛错");
		} catch (error) {
			expect(error).toBeInstanceOf(MemoryContractError);
			expect((error as MemoryContractError).code).toBe(MEMORY_CONTRACT_ERROR_CODES.REVISION_CONFLICT);
			expect((error as Error).message).toContain("2");
			expect((error as Error).message).toContain("5");
		}
	});
});

describe("记忆写入命令解析", () => {
	it("remember 合法输入保留来源与有效时间", () => {
		const command = parseMemoryWriteCommand({
			action: "remember",
			content: "项目 A 用 pnpm",
			kind: "convention",
			scopeName: "project",
			validFrom: "2026-01-01T00:00:00Z",
		});
		expect(command.action).toBe("remember");
	});

	it.each([
		["action 缺失", {}],
		["content 为空", { action: "remember", content: "  ", kind: "fact", scopeName: "project" }],
		["kind 非法", { action: "remember", content: "x", kind: "vibe", scopeName: "project" }],
		["expectedRevision 为负", { action: "correct", memoryId: "m", expectedRevision: -1, content: "x" }],
		["forget 缺 memoryId", { action: "forget" }],
	])("非法输入 %s 报 INVALID_MEMORY_INPUT", (_label, value) => {
		expect(() => parseMemoryWriteCommand(value)).toThrowError(MemoryContractError);
	});
});

describe("遗忘屏障（erasure）合同", () => {
	it("已遗忘家族拒绝写入且绝不恢复 parent 为当前值", () => {
		const state = FIXTURE_ERASURE_WITH_SUPPRESSION;
		expect(isSuppressed("mem-fixture-forgotten", state)).toBe(true);
		try {
			assertNotSuppressed("mem-fixture-forgotten", state);
			expect.unreachable("应当抛错");
		} catch (error) {
			expect((error as MemoryContractError).code).toBe(MEMORY_CONTRACT_ERROR_CODES.MEMORY_SUPPRESSED);
		}
	});

	it("相邻任务提交前重检 epoch：所见纪元落后即拒绝", () => {
		expect(() => assertErasureEpochFresh(3, FIXTURE_ERASURE_WITH_SUPPRESSION)).not.toThrow();
		try {
			assertErasureEpochFresh(2, FIXTURE_ERASURE_WITH_SUPPRESSION);
			expect.unreachable("应当抛错");
		} catch (error) {
			expect((error as MemoryContractError).code).toBe(MEMORY_CONTRACT_ERROR_CODES.MEMORY_SUPPRESSED);
		}
	});

	it("空遗忘状态下全部放行", () => {
		expect(() => assertNotSuppressed("mem-any", FIXTURE_ERASURE_EMPTY)).not.toThrow();
		expect(() => assertErasureEpochFresh(0, FIXTURE_ERASURE_EMPTY)).not.toThrow();
	});
});
