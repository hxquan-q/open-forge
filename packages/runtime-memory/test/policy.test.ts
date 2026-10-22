// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { FIXTURE_INVALID_POLICY_INPUTS, FIXTURE_POLICY_AUTOMATIC, FIXTURE_POLICY_EXPLICIT } from "../src/fixtures.js";
import {
	MEMORY_CONTRACT_ERROR_CODES,
	MemoryContractError,
	parseMemoryPolicyConfiguration,
	resolveMemoryRuntimePolicy,
} from "../src/index.js";

describe("memoryPolicy 边界校验", () => {
	it("合法 explicit 配置可解析并保持往返形状", () => {
		const parsed = parseMemoryPolicyConfiguration({
			mode: "explicit",
			allowedScopes: ["user", "project"],
		});
		expect(parsed).toEqual(FIXTURE_POLICY_EXPLICIT);
		expect(parseMemoryPolicyConfiguration(parsed)).toEqual(parsed);
	});

	it("合法 automatic 配置携带预算与可选日限", () => {
		const parsed = parseMemoryPolicyConfiguration({
			mode: "automatic",
			allowedScopes: ["user", "project", "task"],
			extractionBudget: { model: "fixture-extractor/1", maxOutputTokens: 2048, dailyRequestLimit: 50 },
		});
		expect(parsed).toEqual(FIXTURE_POLICY_AUTOMATIC);
	});

	it.each(FIXTURE_INVALID_POLICY_INPUTS.map((entry) => [entry.label, entry.value] as const))(
		"非法输入 %s 报 INVALID_MEMORY_POLICY 稳定错误",
		(_label, value) => {
			expect(() => parseMemoryPolicyConfiguration(value)).toThrowError(MemoryContractError);
			try {
				parseMemoryPolicyConfiguration(value);
			} catch (error) {
				expect((error as MemoryContractError).code).toBe(MEMORY_CONTRACT_ERROR_CODES.INVALID_MEMORY_POLICY);
			}
		},
	);
});

describe("新旧策略正交性（ADR-0149）", () => {
	it("未提供 memoryPolicy 时新线路关闭，legacy 字段原样生效", () => {
		const resolved = resolveMemoryRuntimePolicy({
			legacy: { memoryMode: true, memoryFile: "C:/claw/MEMORY.md", memoryCharLimit: 4000 },
		});
		expect(resolved.memoryPolicy).toBeUndefined();
		expect(resolved.legacyRolloverEnabled).toBe(true);
	});

	it("memoryFile 单独出现也启用 legacy（与 CLI argv 语义一致）", () => {
		const resolved = resolveMemoryRuntimePolicy({ legacy: { memoryFile: "MEMORY.md" } });
		expect(resolved.legacyRolloverEnabled).toBe(true);
	});

	it("新策略 off 不解读也不关闭 legacy 线路", () => {
		const resolved = resolveMemoryRuntimePolicy({
			legacy: { memoryMode: true },
			memoryPolicy: { mode: "off", allowedScopes: ["user"] },
		});
		expect(resolved.memoryPolicy?.mode).toBe("off");
		expect(resolved.legacyRolloverEnabled).toBe(true);
	});

	it("旧字段缺省时新线路可独立启用", () => {
		const resolved = resolveMemoryRuntimePolicy({
			memoryPolicy: { mode: "explicit", allowedScopes: ["project"] },
		});
		expect(resolved.memoryPolicy?.mode).toBe("explicit");
		expect(resolved.legacyRolloverEnabled).toBe(false);
	});

	it("非法 legacy 字段报 INVALID_MEMORY_INPUT", () => {
		expect(() => resolveMemoryRuntimePolicy({ legacy: { memoryMode: "yes" as unknown as boolean } })).toThrowError(
			MemoryContractError,
		);
		expect(() => resolveMemoryRuntimePolicy({ legacy: { memoryCharLimit: -1 } })).toThrowError(/memoryCharLimit/);
	});

	it("roundtrip：解析结果再入参仍稳定", () => {
		const first = resolveMemoryRuntimePolicy({
			legacy: { memoryMode: true },
			memoryPolicy: { mode: "explicit", allowedScopes: ["user"] },
		});
		const second = resolveMemoryRuntimePolicy({
			legacy: { memoryMode: true },
			memoryPolicy: first.memoryPolicy,
		});
		expect(second).toEqual(first);
	});
});
