// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { MarkdownContent } from "@vetta-org/theme-ui/markdown";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const environment = {
	theme: "dark" as const,
	labels: { copy: "Copy code", copied: "Copied code" },
	getFileIconClass: () => "",
	onOpenFile: () => {},
	onOpenUrl: () => {},
};

/** 流式渲染与历史渲染的 DOM 差异只允许来自流式装饰（分段 span / 尾部类）与
 * 块级元素间的纯空白文本节点（拆分边界处本就不保留，布局不可见；pre 内部不动）。
 * 把装饰展开、只比较根级元素序列后两者必须完全一致，否则冻结拆分改变了渲染结果。 */
function normalize(container: HTMLElement): string {
	const clone = container.cloneNode(true) as HTMLElement;
	for (const span of [...clone.querySelectorAll("span.streaming-chunk")]) {
		span.replaceWith(...[...span.childNodes]);
	}
	const body = clone.querySelector(".markdown-body") ?? clone;
	return [...body.children].map((node) => node.outerHTML).join("");
}

function settle(): void {
	act(() => {
		vi.advanceTimersByTime(4000);
	});
}

describe("MarkdownContent 冻结分割等价性", () => {
	const documents = [
		"第一段正文，含 **加粗**、`行内代码` 与 [链接](https://example.com)。\n\n第二段含 ![图片](img.png) 与自动链接 www.example.com。\n\n第三段 ~~删除线~~ 与硬换行  \n行尾两空格。",
		"标题一\n===\n\n## ATX 标题\n\n- 列表项一\n- 列表项二\n  - 嵌套项\n\n1. 有序一\n2. 有序二\n\n> 引用一行\n>\n> 引用二行\n\n---",
		"| 名称 | 说明 | 值 |\n| --- | --- | ---: |\n| 甲 | 第一行 | 1 |\n| 乙 | 第二行 | 2 |\n\n表格后的段落。",
		"```ts\nconst a = 1;\n```\n\n围栏后的段落。\n\n```python\nprint('hi')\n```\n\n结尾段落。",
		"- [ ] 待办一\n- [x] 待办二\n\n任务列表后的段落，含行内公式 $E=mc^2$ 与代码 `arr[0]`。",
		"引用定义使用者：[label] 与 [label][ref]。\n\n[label]: https://example.com/defined\n[ref]: https://example.com/other\n\n定义之后的段落。",
		"$$\nE = mc^2\n$$\n\n公式后的段落。\n\n<div>\nhtml 块\n</div>\n\nhtml 后的段落。",
		"松散列表：\n\n- 第一项\n\n- 第二项\n\n列表后的段落，不再是列表。",
		"> 引用内含 **加粗** 与 `代码`。\n\n引用后的段落。\n\n> 第二段引用。\n\n结尾。",
		"嵌套结构：\n\n1. 第一项\n   - 嵌套列表\n   - 第二嵌套\n2. 第二项\n\n段落收尾。",
	];

	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe() {}
				disconnect() {}
			},
		);
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it.each(documents)("流式结束后与整篇渲染 DOM 等价：%s", (text) => {
		const streamed = render(<MarkdownContent {...environment} text={text} isStreamingTail />);
		settle();
		streamed.rerender(<MarkdownContent {...environment} text={text} isStreamingTail={false} />);
		settle();

		const plain = render(<MarkdownContent {...environment} text={text} isStreamingTail={false} />);
		expect(normalize(streamed.container)).toBe(normalize(plain.container));
	});
});
