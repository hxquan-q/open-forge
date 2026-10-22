// @vitest-environment jsdom
// Modified by The Open Forge contributors.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownContent } from "./MarkdownContent";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const environment = {
	theme: "dark" as const,
	labels: { copy: "Copy code", copied: "Copied code" },
	getFileIconClass: () => "",
	onOpenFile: () => {},
	onOpenUrl: () => {},
};

function tableChunk(rows: number, from: number): string {
	return Array.from({ length: rows }, (_, i) => `| Item ${from + i} | A detailed description of this record ${from + i} | ${from + i} |\n`).join("");
}

describe("混合文档流式：快路径与常规路径的切换", () => {
	let root: Root;
	let container: HTMLDivElement;
	beforeEach(() => {
		// 把 performance 一并 fake：自适应快照间隔依赖实测时长，真实时间会让
		// 快照时序（进而快路径的推进/回放边界）在运行间漂移，测试不可复现。
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
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

	it("相同表头的两张表被正文隔开：第二张表正确渲染且最终等价", () => {
		const header = "| Name | Description | Value |\n| --- | --- | ---: |\n";
		const table1 = header + tableChunk(80, 0);
		const separator = "\nBetween tables.\n\n";
		const table2 = header + tableChunk(80, 1000);
		const text = table1 + separator + table2;
		act(() => {
			root.render(<MarkdownContent {...environment} text={table1} isStreamingTail />);
		});
		act(() => {
			vi.advanceTimersByTime(1200);
		});
		// 第二张表（相同表头）接续流式：此前会因 promotedRef 携带旧行数而卡在常规路径。
		act(() => {
			root.render(<MarkdownContent {...environment} text={text} isStreamingTail />);
		});
		act(() => {
			vi.advanceTimersByTime(4000);
		});
		const bodies = container.querySelectorAll("tbody");
		expect(bodies.length).toBe(2);
		expect(bodies[0]?.querySelectorAll("tr").length).toBe(80);
		expect(bodies[1]?.querySelectorAll("tr").length).toBe(80);
		expect(container.textContent).toContain("Between tables.");
		expect(container.textContent).toContain("Item 1079");

		const plainContainer = document.createElement("div");
		const plainRoot = createRoot(plainContainer);
		document.body.append(plainContainer);
		act(() => {
			plainRoot.render(<MarkdownContent {...environment} text={text} isStreamingTail={false} />);
		});
		const normalize = (host: HTMLElement): string => {
			const clone = host.cloneNode(true) as HTMLElement;
			for (const span of [...clone.querySelectorAll("span.streaming-chunk")]) {
				span.replaceWith(...[...span.childNodes]);
			}
			const body = clone.querySelector(".markdown-body") ?? clone;
			return [...body.children].map((node) => node.outerHTML).join("");
		};
		const streamedHtml = normalize(container);
		const plainHtml = normalize(plainContainer);
		act(() => plainRoot.unmount());
		plainContainer.remove();
		expect(streamedHtml).toBe(plainHtml);
	});

	it("中等尺寸表格与围栏（2.5k-12k）也走快路径且最终等价", () => {
		// 此前阈值 12k 与节流阈值对齐，2.5k-12k 的单构造尾块每 tick 全量解析；
		// 现在快路径覆盖到 2.5k：迷你/直渲染固定开销远低于全量解析。
		const header = "| Name | Description | Value |\n| --- | --- | ---: |\n";
		const mediumTable = header + tableChunk(60, 0);
		act(() => {
			root.render(<MarkdownContent {...environment} text={mediumTable} isStreamingTail />);
		});
		act(() => {
			vi.advanceTimersByTime(1500);
		});
		expect(container.querySelectorAll("tbody tr").length).toBe(60);

		const withFence = mediumTable + "\n```python\n" + Array.from({ length: 100 }, (_, i) => `print(${i})\n`).join("");
		act(() => {
			root.render(<MarkdownContent {...environment} text={withFence} isStreamingTail />);
		});
		act(() => {
			vi.advanceTimersByTime(1500);
		});
		expect(container.textContent).toContain("print(99)");

		const finalText = withFence + "```\n\nafter medium fence.\n";
		act(() => {
			root.render(<MarkdownContent {...environment} text={finalText} isStreamingTail={false} />);
		});
		act(() => {
			vi.advanceTimersByTime(4000);
		});
		const plainContainer = document.createElement("div");
		const plainRoot = createRoot(plainContainer);
		document.body.append(plainContainer);
		act(() => {
			plainRoot.render(<MarkdownContent {...environment} text={finalText} isStreamingTail={false} />);
		});
		const normalize = (host: HTMLElement): string => {
			const clone = host.cloneNode(true) as HTMLElement;
			for (const span of [...clone.querySelectorAll("span.streaming-chunk")]) {
				span.replaceWith(...[...span.childNodes]);
			}
			const body = clone.querySelector(".markdown-body") ?? clone;
			return [...body.children].map((node) => node.outerHTML).join("");
		};
		const streamedHtml = normalize(container);
		const plainHtml = normalize(plainContainer);
		act(() => plainRoot.unmount());
		plainContainer.remove();
		expect(streamedHtml).toBe(plainHtml);
	});

	it("正文→大表→正文→大围栏→正文 全程内容正确，最终与整篇渲染等价", () => {
		// 阶段 1：纯正文（常规路径 + 段落冻结）。
		const prose1 = "Intro paragraph one.\n\nIntro paragraph two.\n\n";
		act(() => {
			root.render(<MarkdownContent {...environment} text={prose1} isStreamingTail />);
		});
		act(() => {
			vi.advanceTimersByTime(1500);
		});
		expect(container.textContent).toContain("Intro paragraph one.");

		// 阶段 2：表格开始增长（快路径接管，key 切换重挂一次）。
		const header = "| Name | Description | Value |\n| --- | --- | ---: |\n";
		const withTable = prose1 + header + tableChunk(120, 0);
		act(() => {
			root.render(<MarkdownContent {...environment} text={withTable} isStreamingTail />);
		});
		act(() => {
			vi.advanceTimersByTime(1500);
		});
		expect(container.querySelectorAll("tbody tr").length).toBeGreaterThan(100);

		// 阶段 3：表格继续增长到跨过快路径阈值后追加正文（表格冻结、快路径退出）。
		const withMoreTable = withTable + tableChunk(280, 120);
		act(() => {
			root.render(<MarkdownContent {...environment} text={withMoreTable} isStreamingTail />);
		});
		act(() => {
			vi.advanceTimersByTime(1500);
		});
		const rowsPeak = container.querySelectorAll("tbody tr").length;
		expect(rowsPeak).toBe(400);

		// 空行分隔：GFM 表格行不需要管道符，无空行时后续正文会被当作表格行延续。
		const afterTable = withMoreTable + "\nTable finished, back to prose.\n\n";
		act(() => {
			root.render(<MarkdownContent {...environment} text={afterTable} isStreamingTail />);
		});
		act(() => {
			vi.advanceTimersByTime(1500);
		});
		const rowsNow = container.querySelectorAll("tbody tr");
		expect(rowsNow.length).toBe(400);
		expect(rowsNow[399]?.textContent).toContain("Item 399");
		expect(container.textContent).toContain("Table finished, back to prose.");

		// 阶段 4：大围栏尾块（围栏快路径）。
		const fenceBody = Array.from({ length: 800 }, (_, i) => `const step${i} = ${i};\n`).join("");
		const withFence = afterTable + "```ts\n" + fenceBody;
		act(() => {
			root.render(<MarkdownContent {...environment} text={withFence} isStreamingTail />);
		});
		act(() => {
			vi.advanceTimersByTime(1500);
		});
		expect(container.textContent).toContain("const step0");
		expect(container.textContent).toContain("const step799");

		// 阶段 5：围栏闭合 + 结尾正文；结束后与整篇常规渲染逐元素等价。
		const finalText = withFence + "```\n\nDone after fence.\n";
		act(() => {
			root.render(<MarkdownContent {...environment} text={finalText} isStreamingTail />);
		});
		act(() => {
			vi.advanceTimersByTime(4000);
		});
		act(() => {
			root.render(<MarkdownContent {...environment} text={finalText} isStreamingTail={false} />);
		});
		act(() => {
			vi.advanceTimersByTime(4000);
		});

		const plainContainer = document.createElement("div");
		const plainRoot = createRoot(plainContainer);
		document.body.append(plainContainer);
		act(() => {
			plainRoot.render(<MarkdownContent {...environment} text={finalText} isStreamingTail={false} />);
		});
		const normalize = (host: HTMLElement): string => {
			const clone = host.cloneNode(true) as HTMLElement;
			for (const span of [...clone.querySelectorAll("span.streaming-chunk")]) {
				span.replaceWith(...[...span.childNodes]);
			}
			const body = clone.querySelector(".markdown-body") ?? clone;
			return [...body.children].map((node) => node.outerHTML).join("");
		};
		const streamedHtml = normalize(container);
		const plainHtml = normalize(plainContainer);
		act(() => plainRoot.unmount());
		plainContainer.remove();
		expect(streamedHtml).toBe(plainHtml);
	});
});
