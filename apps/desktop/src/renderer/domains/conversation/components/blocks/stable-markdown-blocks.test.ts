// Modified by The Open Forge contributors.
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

		// 裸方括号块改为乐观冻结（渲染与全量解析一致）；定义行到达时同帧重置回退。
		const bracket = "see [ref] here\n\nSecond\n";
		// 括号块冻结；Second 为末块（无后继块）不冻结——与非括号行为一致。
		expect(splitStableMarkdownBlocks(bracket).committed.length).toBe(1);
		const withDef = "see [ref] here\n\nSecond\n\n[ref]: https://e.com\n";
		expect(splitStableMarkdownBlocks(withDef).committed).toEqual([]);
	});
});
