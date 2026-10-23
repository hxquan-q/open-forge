// Copyright The Open Forge contributors.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MemoryPolicyConfiguration } from "@vetta/runtime-memory";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readSavedMemoryPolicyState, resolveHostMemoryPolicy, withHostMemoryPolicy } from "./policy-entry.js";

/**
 * BUG-0148/R4 合同：设置页保存的策略由宿主读进普通会话配置。
 * off/explicit/automatic/切换与显式优先全部经真实 settings.json 读写。
 */

let workDir: string;

beforeEach(() => {
	workDir = mkdtempSync(join(tmpdir(), "desktop-policy-entry-"));
});

afterEach(() => {
	try {
		rmSync(workDir, { recursive: true, force: true });
	} catch {
		/* Windows 句柄滞后 */
	}
});

function savePolicy(state: unknown): void {
	writeFileSync(join(workDir, "settings.json"), `${JSON.stringify(state, null, "\t")}\n`, "utf8");
}

describe("宿主记忆策略入口", () => {
	it("off / 无文件：不注入，返回原 config", () => {
		expect(withHostMemoryPolicy(undefined, workDir)).toBeUndefined();
		savePolicy({ mode: "off" });
		expect(withHostMemoryPolicy(undefined, workDir)).toBeUndefined();
		expect(resolveHostMemoryPolicy(readSavedMemoryPolicyState(workDir))).toBeUndefined();
	});

	it("explicit：注入 user+project 双 scope 的 explicit 配置", () => {
		savePolicy({ mode: "explicit" });
		const injected = withHostMemoryPolicy(undefined, workDir) as { memoryPolicy?: MemoryPolicyConfiguration };
		expect(injected?.memoryPolicy).toEqual({ mode: "explicit", allowedScopes: ["user", "project"] });
	});

	it("automatic：注入抽取预算；缺抽取模型时如实降级 explicit", () => {
		savePolicy({ mode: "automatic", extractionModel: "openai/gpt-x", dailyRequestLimit: 7 });
		const injected = withHostMemoryPolicy(undefined, workDir) as { memoryPolicy?: MemoryPolicyConfiguration };
		expect(injected?.memoryPolicy).toEqual({
			mode: "automatic",
			allowedScopes: ["user", "project"],
			extractionBudget: { model: "openai/gpt-x", maxOutputTokens: 2000, dailyRequestLimit: 7 },
		});
		savePolicy({ mode: "automatic" });
		const degraded = withHostMemoryPolicy(undefined, workDir) as { memoryPolicy?: MemoryPolicyConfiguration };
		expect(degraded?.memoryPolicy?.mode).toBe("explicit");
	});

	it("策略切换即时生效；显式传入的 memoryPolicy 优先于保存值", () => {
		savePolicy({ mode: "explicit" });
		const explicit: MemoryPolicyConfiguration = {
			mode: "automatic",
			allowedScopes: ["user"],
			extractionBudget: { model: "m", maxOutputTokens: 10 },
		};
		const kept = withHostMemoryPolicy({ cwd: "/x", memoryPolicy: explicit }, workDir) as {
			cwd: string;
			memoryPolicy?: MemoryPolicyConfiguration;
		};
		expect(kept.memoryPolicy).toBe(explicit);
		expect(kept.cwd).toBe("/x");
		savePolicy({ mode: "automatic", extractionModel: "openai/gpt-y" });
		const switched = withHostMemoryPolicy(undefined, workDir) as { memoryPolicy?: MemoryPolicyConfiguration };
		expect(switched?.memoryPolicy?.mode).toBe("automatic");
	});

	it("损坏的 settings.json 按 off 处理，不抛错", () => {
		writeFileSync(join(workDir, "settings.json"), "{not-json", "utf8");
		expect(withHostMemoryPolicy(undefined, workDir)).toBeUndefined();
	});
});
