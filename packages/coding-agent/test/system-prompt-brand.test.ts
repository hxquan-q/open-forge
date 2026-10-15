// Copyright The Open Forge contributors.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDesktopCliGuidance, buildSystemPrompt, DEFAULT_BRAND_NAME } from "../src/model-context/index.js";

/** 遗留品牌词：品牌档位下用户与模型都不应再读到它。 */
const LEGACY_BRAND = /\bVetta\b/;

function readPolicySource(): string {
	return readFileSync(new URL("../src/model-context/system-prompt-policy.ts", import.meta.url), "utf8");
}

describe("模型可见文本按品牌档位渲染", () => {
	it("未注入产品名时使用开源档品牌，身份行不出现遗留品牌", () => {
		const prompt = buildSystemPrompt({ selectedTools: ["read"], contextFiles: [], skills: [] });

		expect(prompt).toContain(`**Your name is ${DEFAULT_BRAND_NAME}. You are an AI assistant.**`);
		expect(prompt).not.toMatch(LEGACY_BRAND);
	});

	it("宿主注入的产品名进入身份行（分发档中文界面）", () => {
		const prompt = buildSystemPrompt({
			selectedTools: ["read"],
			contextFiles: [],
			skills: [],
			brandName: "小爱ai",
		});

		expect(prompt).toContain("**Your name is 小爱ai. You are an AI assistant.**");
		expect(prompt).not.toMatch(LEGACY_BRAND);
	});

	it("CLI 指引按产品名渲染，并保留冻结的命令名与配置路径", () => {
		const guidance = buildDesktopCliGuidance("Allstr ai");

		expect(guidance.startsWith("# Allstr ai CLI\n\n")).toBe(true);
		expect(guidance).toContain("running Allstr ai app");
		expect(guidance).toContain("`openforge action`");
		expect(guidance).toContain("`.vetta`");
		expect(guidance).not.toMatch(LEGACY_BRAND);
	});

	it("会话提示词全文（含追加的 CLI 指引）不出现遗留品牌名", () => {
		const prompt = buildSystemPrompt({
			selectedTools: ["read", "bash"],
			contextFiles: [],
			skills: [],
			appendSystemPrompt: buildDesktopCliGuidance("小爱ai"),
			brandName: "小爱ai",
		});

		expect(prompt).toContain("**Your name is 小爱ai. You are an AI assistant.**");
		expect(prompt).not.toMatch(LEGACY_BRAND);
	});

	// 身份行、指引正文与内置工具描述回退都在同一个事实源文件里；直接守住该文件，
	// 避免新增文案时又把遗留品牌名写回来。
	it("提示词事实源文件不含遗留品牌名", () => {
		expect(readPolicySource()).not.toMatch(LEGACY_BRAND);
	});
});
