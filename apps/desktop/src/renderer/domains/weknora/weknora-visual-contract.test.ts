// Copyright The Open Forge contributors.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 视觉打磨（REQ-0020）的**静态契约**独立用例（③ 测试相位自建）。
 *
 * 角度与实现者自建的组件用例不同：这些是 jsdom 测不到的「源码/样式表层面」事实 ——
 * AC-4 的「纯 CSS @keyframes、只动 opacity/transform、时长 420ms」、AC-9 的 reduced-motion
 * 逐字退化（T02 明言「reduced-motion 无组件级断言」，只能查样式表）、AC-14 的「无 any /
 * 无硬编码色值 / 单文件 < 400 行」。
 */

const weknoraDir = import.meta.dirname;
const stylesCss = readFileSync(join(weknoraDir, "..", "..", "styles.css"), "utf8");

/** 按首花括号起算、括号配平地取出一个 CSS 块（含嵌套 @media / @keyframes）。 */
function cssBlock(css: string, header: string): string {
	const start = css.indexOf(header);
	expect(start, `missing block: ${header}`).toBeGreaterThanOrEqual(0);
	let depth = 0;
	for (let index = start; index < css.length; index += 1) {
		const char = css[index];
		if (char === "{") depth += 1;
		else if (char === "}") {
			depth -= 1;
			if (depth === 0) return css.slice(start, index + 1);
		}
	}
	throw new Error(`unbalanced block: ${header}`);
}

const changedSources: ReadonlyArray<readonly [name: string, source: string]> = [
	["ThinkingDots.tsx", readFileSync(join(weknoraDir, "components", "ThinkingDots.tsx"), "utf8")],
	["ThinkingBlock.tsx", readFileSync(join(weknoraDir, "components", "ThinkingBlock.tsx"), "utf8")],
	["MessageBubble.tsx", readFileSync(join(weknoraDir, "components", "MessageBubble.tsx"), "utf8")],
	["WeKnoraPageView.tsx", readFileSync(join(weknoraDir, "components", "WeKnoraPageView.tsx"), "utf8")],
];

describe("视觉打磨 · 逐字入场样式契约（AC-4 / AC-9）", () => {
	it("AC-4：.weknora-stream-char 走纯 CSS @keyframes、时长 420ms", () => {
		const rule = cssBlock(stylesCss, ".weknora-stream-char {");
		expect(rule).toMatch(/animation:\s*weknora-stream-char-in\s+420ms/);
	});

	it("AC-4：关键帧只动 opacity / transform（不触发布局或重绘面）", () => {
		const keyframes = cssBlock(stylesCss, "@keyframes weknora-stream-char-in {");
		const animated = [...keyframes.matchAll(/([a-z-]+)\s*:/g)].map((match) => match[1]);
		expect(animated.length).toBeGreaterThan(0);
		expect(new Set(animated)).toEqual(new Set(["opacity", "transform"]));
	});

	it("AC-4/AC-9：prefers-reduced-motion 下逐字入场退化（.weknora-stream-char 不跑动画）", () => {
		expect(stylesCss).toMatch(
			/@media \(prefers-reduced-motion: reduce\) \{\s*\.weknora-stream-char \{\s*animation: none;/,
		);
	});
});

describe("视觉打磨 · 通用约束（AC-13 / AC-14）", () => {
	it("AC-14：改动文件无硬编码色值、无 any", () => {
		for (const [name, source] of changedSources) {
			expect(source, `${name} 含硬编码色值`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
			expect(source, `${name} 含 any`).not.toMatch(/\bany\b/);
		}
	});

	it("AC-14 / C7：改动文件均 < 400 行（无需文件头「为什么留在一个文件」说明）", () => {
		for (const [name, source] of changedSources) {
			expect(source.split("\n").length, `${name} 超过 400 行`).toBeLessThan(400);
		}
	});

	it("AC-13：副标题文案不在组件源码里硬编码（走 i18n catalog）", () => {
		const view = changedSources.find(([name]) => name === "WeKnoraPageView.tsx")?.[1] ?? "";
		expect(view).not.toContain("小爱酱");
	});
});
