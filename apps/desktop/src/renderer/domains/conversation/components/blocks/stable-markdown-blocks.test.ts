import { splitStableMarkdownBlocks } from "@vetta-org/theme-ui/markdown";
import { describe, expect, it } from "vitest";

describe("splitStableMarkdownBlocks", () => {
	it("后继块的完整首行到达后提交已完成段落，闭合围栏仍提交前缀", () => {
		const prose = "First paragraph.\n\nSecond\n";
		expect(splitStableMarkdownBlocks(prose)).toEqual({
			committed: ["First paragraph.\n"],
			tail: "\nSecond\n",
		});

		const fenced = "```js\nconst a = 1;\n```\n\nmore";
		expect(splitStableMarkdownBlocks(fenced)).toEqual({
			committed: ["```js\nconst a = 1;\n```\n"],
			tail: "\nmore",
		});
	});

	it("增长中的部分行不提前冻结；含裸方括号的块保持整篇重解析回退", () => {
		const partial = "First paragraph.\n\nSecond";
		expect(splitStableMarkdownBlocks(partial)).toEqual({ committed: [], tail: partial });

		const bracket = "see [ref] here\n\nSecond\n";
		expect(splitStableMarkdownBlocks(bracket)).toEqual({ committed: [], tail: bracket });
	});
});
