// Copyright The Open Forge contributors.

import { defaultStringifier } from "fumadocs-core/mdx-plugins/stringifier";
import { describe, expect, it } from "vitest";

type StringifyInput = Parameters<ReturnType<typeof defaultStringifier>>[0];

/**
 * 只构造 attention 所需的最小 mdast，避免引入解析依赖。
 * `strong`/`emphasis` 走 mdast-util-to-markdown 的 attention 分支。
 */
function paragraph(children: unknown[]): StringifyInput {
	return {
		type: "root",
		children: [{ type: "paragraph", children }],
	} as unknown as StringifyInput;
}

describe("fumadocs stringifier 的 attention 序列化", () => {
	it("strong 与 emphasis 不再无限递归（BUG-0067 回归）", () => {
		const stringify = defaultStringifier();
		const strong = String(
			stringify(paragraph([{ type: "strong", children: [{ type: "text", value: "bold" }] }]), {}),
		);
		const emphasis = String(
			stringify(paragraph([{ type: "emphasis", children: [{ type: "text", value: "it" }] }]), {}),
		);
		expect(strong).toContain("**bold**");
		expect(emphasis).toContain("*it*");
	});
});
