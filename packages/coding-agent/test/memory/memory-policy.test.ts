// Modified by The Open Forge contributors.

import { MemoryContractError, resolveMemoryRuntimePolicy } from "@vetta/runtime-memory";
import { describe, expect, it } from "vitest";
import { parseCodingAgentRuntimeSessionConfiguration } from "../../src/composition/index.js";

/**
 * TASK-0369 合同测试：产品会话边界对新旧记忆策略的接受与拒绝。
 * 真实边界是 parseCodingAgentRuntimeSessionConfiguration（RuntimeHost
 * 创建会话时的 payload 校验）；策略纯函数来自 @vetta/runtime-memory。
 */
describe("会话配置边界的记忆策略解析", () => {
	const base = { sessionId: "session-1" };

	it("未携带记忆字段的配置不受影响（旧行为零变化）", () => {
		const parsed = parseCodingAgentRuntimeSessionConfiguration(base);
		expect(parsed.memoryMode).toBeUndefined();
		expect(parsed.memoryPolicy).toBeUndefined();
	});

	it("legacy memoryMode/memoryFile 原样透传，不产生新策略", () => {
		const parsed = parseCodingAgentRuntimeSessionConfiguration({
			...base,
			memoryMode: true,
			memoryFile: "C:/claw/MEMORY.md",
		});
		expect(parsed.memoryMode).toBe(true);
		expect(parsed.memoryPolicy).toBeUndefined();
		const resolved = resolveMemoryRuntimePolicy({
			legacy: { memoryMode: parsed.memoryMode, memoryFile: parsed.memoryFile },
			memoryPolicy: parsed.memoryPolicy,
		});
		expect(resolved.legacyRolloverEnabled).toBe(true);
		expect(resolved.memoryPolicy).toBeUndefined();
	});

	it("合法 memoryPolicy 通过边界并保持形状", () => {
		const parsed = parseCodingAgentRuntimeSessionConfiguration({
			...base,
			memoryPolicy: { mode: "explicit", allowedScopes: ["user", "project"] },
		});
		expect(parsed.memoryPolicy).toEqual({ mode: "explicit", allowedScopes: ["user", "project"] });
	});

	it("新旧字段同传时两侧各自成立（IM 场景正交组合）", () => {
		const parsed = parseCodingAgentRuntimeSessionConfiguration({
			...base,
			memoryMode: true,
			memoryPolicy: { mode: "explicit", allowedScopes: ["project"] },
		});
		const resolved = resolveMemoryRuntimePolicy({
			legacy: { memoryMode: parsed.memoryMode },
			memoryPolicy: parsed.memoryPolicy,
		});
		expect(resolved.legacyRolloverEnabled).toBe(true);
		expect(resolved.memoryPolicy?.mode).toBe("explicit");
	});

	it("非法 memoryPolicy 在会话边界被稳定错误拒绝", () => {
		expect(() =>
			parseCodingAgentRuntimeSessionConfiguration({
				...base,
				memoryPolicy: { mode: "always", allowedScopes: [] },
			}),
		).toThrowError(MemoryContractError);
	});

	it("automatic 缺预算在会话边界被拒绝", () => {
		expect(() =>
			parseCodingAgentRuntimeSessionConfiguration({
				...base,
				memoryPolicy: { mode: "automatic", allowedScopes: ["user"] },
			}),
		).toThrowError(/extractionBudget/);
	});
});
