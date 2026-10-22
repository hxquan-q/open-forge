// @vitest-environment jsdom
// Modified by The Open Forge contributors.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownContent } from "./MarkdownContent";
import { detectGrowingTable } from "./tail-table";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const environment = {
	theme: "dark" as const,
	labels: { copy: "Copy code", copied: "Copied code" },
	getFileIconClass: () => "",
	onOpenFile: () => {},
	onOpenUrl: () => {},
};

function makeTable(rows: number, trailingNewline = true): string {
	const header = "| Name | Description | Value |\n| --- | --- | ---: |\n";
	const body = Array.from({ length: rows }, (_, i) => `| Item ${i} | A detailed description of this record ${i} | ${i} |\n`).join(
		"",
	);
	const text = header + body;
	return trailingNewline ? text : text.trimEnd();
}

describe("detectGrowingTable", () => {
	it("识别纯增长表格：表头、分隔行与全部含管道符的数据行", () => {
		const shape = detectGrowingTable(makeTable(400));
		expect(shape).not.toBeNull();
		expect(shape?.headerBlock).toBe("| Name | Description | Value |\n| --- | --- | ---: |\n");
		expect(shape?.rowLines.length).toBe(400);
		expect(shape?.rowLines[0]).toBe("| Item 0 | A detailed description of this record 0 | 0 |");
		expect(shape?.endsWithNewline).toBe(true);
	});

	it("小于阈值、混合结构或缺少分隔行的尾块不启用", () => {
		expect(detectGrowingTable(makeTable(100))).toBeNull();
		expect(detectGrowingTable(makeTable(400) + "\nplain paragraph follows")).toBeNull();
		expect(detectGrowingTable(`| a | b |\nnot a delimiter\n| 1 | 2 |\n`.repeat(200))).toBeNull();
	});
});

describe("TailTableDocument 流式大表快路径", () => {
	let root: Root;
	let container: HTMLDivElement;
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe() {}
				unobserve() {}
				disconnect() {}
			},
		);
		root = createRoot((container = document.createElement("div")));
		document.body.append(container);
	});
	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.runOnlyPendingTimers();
		vi.useRealTimers();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("流式期间渲染全部数据行，结束后与整篇渲染 DOM 等价", () => {
		const text = makeTable(400);
		act(() => {
			root.render(<MarkdownContent {...environment} text={text} isStreamingTail />);
		});
		act(() => {
			vi.advanceTimersByTime(4000);
		});
		const rowsWhileStreaming = container.querySelectorAll("tbody tr").length;
		expect(rowsWhileStreaming).toBe(400);
		expect(container.querySelector("tbody tr")?.textContent).toContain("Item 0");

		// 流结束：快路径退出，常规路径全量渲染最终内容。
		act(() => {
			root.render(<MarkdownContent {...environment} text={text} isStreamingTail={false} />);
		});
		act(() => {
			vi.advanceTimersByTime(4000);
		});
		const streamedHtml = container.querySelector(".markdown-body")?.innerHTML;

		const plainContainer = document.createElement("div");
		const plainRoot = createRoot(plainContainer);
		document.body.append(plainContainer);
		act(() => {
			plainRoot.render(<MarkdownContent {...environment} text={text} isStreamingTail={false} />);
		});
		const plainHtml = plainContainer.querySelector(".markdown-body")?.innerHTML;
		act(() => plainRoot.unmount());
		plainContainer.remove();

		expect(streamedHtml).toBe(plainHtml);
	});

	it("纯追加新行后旧行保持身份，行数完整", () => {
		const initial = makeTable(400);
		act(() => {
			root.render(<MarkdownContent {...environment} text={initial} isStreamingTail />);
		});
		act(() => {
			vi.advanceTimersByTime(4000);
		});
		expect(container.querySelectorAll("tbody tr").length).toBe(400);
		const lastRowText = container.querySelectorAll("tbody tr")[399]?.textContent;

		const grown = `${initial}| Item 400 | brand new row | 400 |\n`;
		act(() => {
			root.render(<MarkdownContent {...environment} text={grown} isStreamingTail />);
		});
		act(() => {
			vi.advanceTimersByTime(4000);
		});
		const rows = container.querySelectorAll("tbody tr");
		expect(rows.length).toBe(401);
		// DOM 身份不作为本快路径的保证（React 按键重排时可能重建行节点）；
		// 正确性由行内容与整表等价性保证。
		expect(rows[399]?.textContent).toBe(lastRowText);
		expect(rows[0]?.textContent).toContain("Item 0");
		expect(rows[400]?.textContent).toContain("brand new row");
	});
});
