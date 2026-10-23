// Copyright The Open Forge contributors.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { MemoryModelBudget, MemoryPolicyConfiguration } from "@vetta/runtime-memory";
import type { MemoryPolicyState } from "../../shared/memory.js";

/**
 * 宿主记忆策略入口（BUG-0148/R4）：把设置页保存的策略读进普通新建/恢复
 * 会话。由主进程解析（不依赖 Renderer 自述）；显式传入的 memoryPolicy
 * 优先于保存值；off/缺省返回 undefined（不装配 Feature，旧 memoryMode
 * 路线不受影响）。
 */

const POLICY_FILE = "settings.json";
const DEFAULT_EXTRACTION_MAX_OUTPUT_TOKENS = 2000;

/** 读取记忆目录中保存的策略（无文件/损坏时按 off 处理，不抛错）。 */
export function readSavedMemoryPolicyState(memoryDirectory: string): MemoryPolicyState {
	try {
		const parsed = JSON.parse(readFileSync(join(memoryDirectory, POLICY_FILE), "utf8")) as MemoryPolicyState;
		if (parsed.mode === "off" || parsed.mode === "explicit" || parsed.mode === "automatic") {
			return {
				mode: parsed.mode,
				...(typeof parsed.extractionModel === "string" ? { extractionModel: parsed.extractionModel } : {}),
				...(typeof parsed.dailyRequestLimit === "number" ? { dailyRequestLimit: parsed.dailyRequestLimit } : {}),
			};
		}
		return { mode: "off" };
	} catch {
		return { mode: "off" };
	}
}

/** 把保存的策略投影为会话配置：automatic 必须有抽取模型，否则按 explicit 降级并注明。 */
export function resolveHostMemoryPolicy(saved: MemoryPolicyState): MemoryPolicyConfiguration | undefined {
	if (saved.mode === "off") return undefined;
	if (saved.mode === "explicit") {
		return { mode: "explicit", allowedScopes: ["user", "project"] };
	}
	if (typeof saved.extractionModel !== "string" || saved.extractionModel.trim() === "") {
		// automatic 缺抽取模型：不静默假装自动——降级 explicit，行为如实可查。
		return { mode: "explicit", allowedScopes: ["user", "project"] };
	}
	const extractionBudget: MemoryModelBudget = {
		model: saved.extractionModel,
		maxOutputTokens: DEFAULT_EXTRACTION_MAX_OUTPUT_TOKENS,
		...(typeof saved.dailyRequestLimit === "number" ? { dailyRequestLimit: saved.dailyRequestLimit } : {}),
	};
	return {
		mode: "automatic",
		allowedScopes: ["user", "project"],
		extractionBudget,
	};
}

/**
 * 会话配置注入：显式传入优先；否则读保存策略。返回原 config 引用表示
 * 不注入（off/缺省），调用方零改动。
 */
export function withHostMemoryPolicy<Config extends { memoryPolicy?: MemoryPolicyConfiguration }>(
	config: Config | undefined,
	memoryDirectory: string,
): Config | undefined {
	if (config?.memoryPolicy !== undefined) return config;
	const resolved = resolveHostMemoryPolicy(readSavedMemoryPolicyState(memoryDirectory));
	if (resolved === undefined) return config;
	// 展开保留 Config 的其余字段、只覆盖 memoryPolicy：TS 无法证明
	// `{ ...Config, memoryPolicy }` 仍是 Config 的具体子类型（泛型展开限制），
	// 这里的断言是结构等价的：原位只多/改 memoryPolicy 一个已知可选键。
	return { ...config, memoryPolicy: resolved } as Config;
}

/** 桌面记忆目录（与 composition/控制面同款布局）。 */
export function desktopMemoryDirectory(agentDir: string): string {
	return join(agentDir, "memory", "profile-default");
}

export function memorySettingsExist(memoryDirectory: string): boolean {
	return existsSync(join(memoryDirectory, POLICY_FILE));
}
