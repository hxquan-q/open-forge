// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { FIXTURE_ERASURE_EMPTY, FIXTURE_ERASURE_WITH_SUPPRESSION } from "../src/fixtures.js";
import {
	assertErasureEpochFresh,
	assertNotSuppressed,
	isSuppressed,
	MEMORY_CONTRACT_ERROR_CODES,
	MemoryContractError,
} from "../src/index.js";

/**
 * TASK-0373 遗忘屏障合同（跨消费者共享）：Node 实现、词法/向量/摘要派生
 * 消费者与产品工具层共同遵守同一份纯合同——epoch 单调、提交前重检、
 * 已抑制家族拒绝写入、绝不静默恢复。
 */
describe("erasure 合同（runtime-memory 出口，双消费方共享）", () => {
	it("isSuppressed 按家族判定", () => {
		expect(isSuppressed("mem-fixture-forgotten", FIXTURE_ERASURE_WITH_SUPPRESSION)).toBe(true);
		expect(isSuppressed("mem-other", FIXTURE_ERASURE_WITH_SUPPRESSION)).toBe(false);
		expect(isSuppressed("mem-any", FIXTURE_ERASURE_EMPTY)).toBe(false);
	});

	it("assertNotSuppressed 拒绝写入已遗忘家族（稳定错误码）", () => {
		expect(() => assertNotSuppressed("mem-fixture-forgotten", FIXTURE_ERASURE_WITH_SUPPRESSION)).toThrowError(
			MemoryContractError,
		);
		try {
			assertNotSuppressed("mem-fixture-forgotten", FIXTURE_ERASURE_WITH_SUPPRESSION);
		} catch (error) {
			expect((error as MemoryContractError).code).toBe(MEMORY_CONTRACT_ERROR_CODES.MEMORY_SUPPRESSED);
		}
	});

	it("派生消费者提交前重检：所见纪元落后即拒绝（向量/摘要/FTS 同一合同）", () => {
		expect(() => assertErasureEpochFresh(3, FIXTURE_ERASURE_WITH_SUPPRESSION)).not.toThrow();
		try {
			assertErasureEpochFresh(2, FIXTURE_ERASURE_WITH_SUPPRESSION);
			expect.unreachable("应当抛错");
		} catch (error) {
			expect((error as MemoryContractError).code).toBe(MEMORY_CONTRACT_ERROR_CODES.MEMORY_SUPPRESSED);
		}
		expect(() => assertErasureEpochFresh(-1, FIXTURE_ERASURE_EMPTY)).toThrowError(/非负整数/);
	});
});
