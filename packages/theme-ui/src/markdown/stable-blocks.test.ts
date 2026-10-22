// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { createStableMarkdownScanner, splitStableMarkdownBlocks } from "./stable-blocks";

describe("splitStableMarkdownBlocks", () => {
	it.each(["$$\n```\nformula\n```\n$$", "<html>\n```\npage\n```\n</html>"])(
		"rich blocks preserve parser context and previously frozen prefixes: %s",
		(rich) => {
			const prefix = "```ts\nconst x = 1;\n```\n";
			const text = `${prefix}\n${rich}\nAfter`;
			expect(splitStableMarkdownBlocks(text)).toEqual({ committed: [prefix], tail: `\n${rich}\nAfter` });
		},
	);
	it("空文本没有已提交块", () => {
		expect(splitStableMarkdownBlocks("")).toEqual({ committed: [], tail: "" });
	});

	it("只有一段未结束的段落全部留在 tail", () => {
		expect(splitStableMarkdownBlocks("Hello there")).toEqual({
			committed: [],
			tail: "Hello there",
		});
	});

	it("后继块的完整首行到达后提交已完成的顶层段落", () => {
		const text = "First paragraph.\n\nSecond\n";
		expect(splitStableMarkdownBlocks(text)).toEqual({
			committed: ["First paragraph.\n"],
			tail: "\nSecond\n",
		});
	});

	it("增长中的部分行不触发前一段落的冻结判定", () => {
		// 部分行还可能长成列表标记（1 → 1.）或管道行，在其上判定会破坏前缀性。
		const text = "First paragraph.\n\nSecond still growing";
		expect(splitStableMarkdownBlocks(text)).toEqual({ committed: [], tail: text });
	});

	it("部分行的追加可能翻转守卫时不产生前缀违例", () => {
		expect(splitStableMarkdownBlocks("- a\n\n1").committed).toEqual([]);
		expect(splitStableMarkdownBlocks("- a\n\n1.").committed).toEqual([]);
		expect(splitStableMarkdownBlocks("- a\n\n1. x\n").committed).toEqual([]);
		expect(splitStableMarkdownBlocks("- a\n\nplain\n").committed).toEqual(["- a\n"]);
	});

	it("裸方括号块乐观冻结；引用定义行到达时同帧重置重拆", () => {
		// 无定义：括号块与后续块照常冻结（定义未到达时渲染与全量解析一致）。
		const noDef = "see [ref] here\n\nplain1\n\nplain2\n";
		// 前两块冻结（末块无后继块不冻结，与非括号行为一致）。
		expect(splitStableMarkdownBlocks(noDef).committed.length).toBe(2);

		// 定义行到达：同帧重置——已提交的括号块回到 tail；重扫时首块（括号）不可
		// 冻结，前缀规则使其后块也保持 tail（=保守行为，整条流其余部分全量解析）。
		const withDef = "see [ref] here\n\nplain1\n\n[ref]: https://example.com\n\nafter\n";
		const split = splitStableMarkdownBlocks(withDef);
		expect(split.committed).toEqual([]);
		expect(split.tail).toBe(withDef);
		// 定义行之后再出现的新非括号块同样不再冻结（sawDefinition 终生为真）。
		const later = `${withDef}plain3\n`;
		expect(splitStableMarkdownBlocks(later).committed).toEqual([]);
	});

	it("行内链接与图片自含，可以冻结", () => {
		const text = "[text](url) and ![alt](img.png)\n\nSecond\n";
		expect(splitStableMarkdownBlocks(text)).toEqual({
			committed: ["[text](url) and ![alt](img.png)\n"],
			tail: "\nSecond\n",
		});
	});

	it("松散列表跨空行续项，直到非列表块开始才整体冻结", () => {
		const text = "1. foo\n\n2. bar\n\nNext paragraph\n";
		expect(splitStableMarkdownBlocks(text)).toEqual({
			committed: ["1. foo\n\n2. bar\n"],
			tail: "\nNext paragraph\n",
		});
	});

	it("列表后紧跟新列表项时不拆分，整段留在 tail", () => {
		const text = "1. foo\n\n- bar\n";
		expect(splitStableMarkdownBlocks(text)).toEqual({ committed: [], tail: text });
	});

	it("引用跨空行延续，非引用块开始后整体冻结", () => {
		const text = "> a\n\n> b\n\nPlain\n";
		expect(splitStableMarkdownBlocks(text)).toEqual({
			committed: ["> a\n\n> b\n"],
			tail: "\nPlain\n",
		});
	});

	it("完成的表格在非表格块开始后冻结，增长中的表格留在 tail", () => {
		const growing = "| a | b |\n|---|---|\n| 1 | 2 |";
		expect(splitStableMarkdownBlocks(growing)).toEqual({ committed: [], tail: growing });

		const done = "| a | b |\n|---|---|\n| 1 | 2 |\n\nAfter\n";
		expect(splitStableMarkdownBlocks(done)).toEqual({
			committed: ["| a | b |\n|---|---|\n| 1 | 2 |\n"],
			tail: "\nAfter\n",
		});
	});

	it("含管道符的块后继行仍含管道时不冻结，避免拆表或回溯表头", () => {
		const text = "| a | b |\n\n|---|---|";
		expect(splitStableMarkdownBlocks(text)).toEqual({ committed: [], tail: text });
	});

	it("缩进块不冻结", () => {
		const text = "    indented code\n\nNext";
		expect(splitStableMarkdownBlocks(text)).toEqual({ committed: [], tail: text });
	});

	it("以 < 开头的行不冻结，保持 rich HTML 解析上下文", () => {
		const text = "<custom>\nfoo\n\nNext";
		expect(splitStableMarkdownBlocks(text)).toEqual({ committed: [], tail: text });
	});

	it("setext 标题整体冻结", () => {
		const text = "Title\n===\n\nNext\n";
		expect(splitStableMarkdownBlocks(text)).toEqual({
			committed: ["Title\n===\n"],
			tail: "\nNext\n",
		});
	});

	it("前导空行随首个提交块一起提交，不丢字符", () => {
		const text = "\n\nPara one.\n\nSecond\n";
		expect(splitStableMarkdownBlocks(text)).toEqual({
			committed: ["\n\nPara one.\n"],
			tail: "\nSecond\n",
		});
	});

	it("CRLF 段落也能提交", () => {
		const text = "First paragraph.\r\n\r\nSecond\r\n";
		expect(splitStableMarkdownBlocks(text)).toEqual({
			committed: ["First paragraph.\r\n"],
			tail: "\r\nSecond\r\n",
		});
	});

	it("字符级追加流下已提交块是严格前缀（定义边界单次收缩例外），拼接恒等", () => {
		const documents = [
			"Intro paragraph.\n\n```js\nconst a = 1;\n```\n\n| h |\n|---|\n| 1 |\n\n- item\n\n- item2\n\n> quote\n\nTail ",
			"see [ref] here\n\nplain\n\n```ts\ncode\n```\n\ntail ",
			"<html>\n<body\n```\nraw fence inside html\n```\n</body>\n</html>\n\nafter ",
			"- a\n\n1\n.\nnext line\n\nplain after\n\n| a | b |\n|---|---|\nplain\n",
		];
		for (const base of documents) {
			let previous: string[] = [];
			let text = "";
			for (let size = 1; size <= base.length; size += 1) {
				text = base.slice(0, size);
				const split = splitStableMarkdownBlocks(text);
				expect(split.committed.slice(0, previous.length)).toEqual(previous);
				expect(split.committed.join("") + split.tail).toBe(text);
				previous = [...split.committed];
			}
		}
		// 定义行到达会单次收缩已提交集（乐观冻结的重置）；此后重新单调。
		const withDef = "see [ref] here\n\nplain\n\n[ref]: https://e.com\n";
		let shrunk = false;
		let previous: string[] = [];
		for (let size = 1; size <= withDef.length; size += 1) {
			const text = withDef.slice(0, size);
			const split = splitStableMarkdownBlocks(text);
			if (split.committed.length < previous.length) {
				expect(shrunk).toBe(false);
				shrunk = true;
			} else {
				expect(split.committed.slice(0, previous.length)).toEqual(previous);
			}
			expect(split.committed.join("") + split.tail).toBe(text);
			previous = [...split.committed];
		}
		expect(shrunk).toBe(true);
	});

	it("增量扫描器与全量扫描在字符级追加流下结果一致", () => {
		const documents = [
			"Intro paragraph.\n\n```js\nconst a = 1;\n```\n\n| h |\n|---|\n| 1 |\n\n- item\n\n- item2\n\n> quote\n\nTail ",
			"see [ref] here\n\nplain\n\n```ts\ncode\n```\n\ntail ",
			"<html>\n<body\n```\nraw fence inside html\n```\n</body>\n</html>\n\nafter ",
			"- a\n\n1\n.\nnext line\n\nplain after\n\n| a | b |\n|---|---|\nplain\n",
			"$$\nE = mc^2\n$$\n\nafter math\n\n```\nunclosed fence\n",
			// 定义行中途到达：触发乐观冻结的同帧重置（增量恢复态与中途归零重扫的交互）。
			"uses [label] here.\n\nplain\n\n[label]: https://e.com\n\nafter def\n\nmore plain\n",
			"footnote user[^1].\n\ntext\n\n[^1]: note body\n\nend\n",
		];
		for (const base of documents) {
			const scanner = createStableMarkdownScanner();
			let text = "";
			for (let size = 1; size <= base.length; size += 1) {
				text = base.slice(0, size);
				const incremental = scanner.scan(text);
				const full = splitStableMarkdownBlocks(text);
				expect(incremental.committed).toEqual(full.committed);
				expect(incremental.tail).toBe(full.tail);
			}
		}
	});

	it("增量扫描器无新增提交时保持数组引用稳定，文本改写时自动重扫", () => {
		const scanner = createStableMarkdownScanner();
		const first = scanner.scan("One.\n\nTwo\n");
		expect(first.committed).toEqual(["One.\n"]);
		const again = scanner.scan("One.\n\nTwo\nmore words");
		expect(again.committed).toBe(first.committed);
		const grown = scanner.scan("One.\n\nTwo\nmore words.\n\nThree\n");
		expect(grown.committed.length).toBe(2);
		expect(grown.committed[0]).toBe("One.\n");
		const replaced = scanner.scan("Completely different.\n\nNext\n");
		expect(replaced.committed).toEqual(["Completely different.\n"]);
	});

	it("松散有序列表整段留在 tail", () => {
		const text = "1. foo\n\n2. bar\n";
		expect(splitStableMarkdownBlocks(text)).toEqual({ committed: [], tail: text });
	});

	it("闭合围栏后面没有正文时整块留在 tail", () => {
		const fence = "```js\nconst a = 1;\n```";
		expect(splitStableMarkdownBlocks(fence)).toEqual({ committed: [], tail: fence });
	});

	it("闭合围栏后面还有正文时提交围栏", () => {
		const text = "```js\nconst a = 1;\n```\n\nmore";
		expect(splitStableMarkdownBlocks(text)).toEqual({
			committed: ["```js\nconst a = 1;\n```\n"],
			tail: "\nmore",
		});
	});

	it("未闭合围栏整段留在 tail，即使中间有空行", () => {
		const text = "```js\nconst a = 1;\n\nconst b = 2;\n";
		expect(splitStableMarkdownBlocks(text)).toEqual({ committed: [], tail: text });
	});

	it("围栏闭合行后若还有非空白字符则不算闭合", () => {
		const text = "```js\nconst a = 1;\n``` notclose\nstill in fence";
		expect(splitStableMarkdownBlocks(text)).toEqual({ committed: [], tail: text });
	});

	it("info string 含反引号的行不能当作开围栏", () => {
		const text = "```js`oops\nnot a fence";
		expect(splitStableMarkdownBlocks(text)).toEqual({ committed: [], tail: text });
	});

	it("波浪线围栏的 info string 允许含波浪线", () => {
		const text = "~~~ a~b\ncode\n~~~\n\nafter";
		expect(splitStableMarkdownBlocks(text)).toEqual({
			committed: ["~~~ a~b\ncode\n~~~\n"],
			tail: "\nafter",
		});
	});

	it("波浪线围栏与反引号围栏互不闭合", () => {
		const text = "~~~\ncode\n```\nstill\n~~~\n\nafter";
		expect(splitStableMarkdownBlocks(text)).toEqual({
			committed: ["~~~\ncode\n```\nstill\n~~~\n"],
			tail: "\nafter",
		});
	});

	it("列表项里的缩进围栏不提交，避免把有序列表拆成两份文档", () => {
		const text = "1. first\n   ```js\n   x\n   ```\n2. second\n";
		expect(splitStableMarkdownBlocks(text)).toEqual({ committed: [], tail: text });
	});

	it("CRLF 闭合行仍能提交顶层围栏", () => {
		const text = "```js\r\nconst a = 1;\r\n```\r\n\r\nmore";
		expect(splitStableMarkdownBlocks(text)).toEqual({
			committed: ["```js\r\nconst a = 1;\r\n```\r\n"],
			tail: "\r\nmore",
		});
	});
});
