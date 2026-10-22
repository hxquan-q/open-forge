import { splitStableMarkdownBlocks } from "@vetta-org/theme-ui/markdown";
import { describe, expect, it } from "vitest";

describe("splitStableMarkdownBlocks", () => {
	it("后继块开始后提交已完成段落，闭合围栏仍提交前缀", () => {
		const prose = "First paragraph.\n\nSecond";
		expect(splitStableMarkdownBlocks(prose)).toEqual({
			committed: ["First paragraph.\n"],
			tail: "\nSecond",
		});

		const fenced = "```js\nconst a = 1;\n```\n\nmore";
		expect(splitStableMarkdownBlocks(fenced)).toEqual({
			committed: ["```js\nconst a = 1;\n```\n"],
			tail: "\nmore",
		});
	});

	it("含裸方括号的块不提交，保持整篇重解析回退", () => {
		const prose = "see [ref] here\n\nSecond";
		expect(splitStableMarkdownBlocks(prose)).toEqual({ committed: [], tail: prose });
	});
});
