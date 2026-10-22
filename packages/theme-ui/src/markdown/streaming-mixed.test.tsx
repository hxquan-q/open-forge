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

	it("details 折叠块与嵌套 div 流式正确且最终等价", () => {
		const item = (i: number) =>
			`<details><summary>Item ${i}</summary>\n\nContent ${i} with text.\n\n</details>\n\n`;
		const part1 = `intro.\n\n${item(1)}${item(2)}`;
		act(() => {
			root.render(<MarkdownContent {...environment} text={part1} isStreamingTail />);
		});
		act(() => {
			vi.advanceTimersByTime(1200);
		});
		expect(container.textContent).toContain("Item 1");

		const nested = `\n<div>\nouter\n<div>inner</div>\nstill outer\n</div>\n\n`;
		const finalText = part1 + nested + `${item(3)}done.\n`;
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
		expect(container.textContent).toContain("Item 3");
		expect(container.textContent).toContain("still outer");
		expect(container.textContent).toContain("done.");

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

	it("正文与 \$\$ 数学区交替流式：区域逐个冻结且最终等价", () => {
		const para = (i: number) => `Problem ${i} statement.\n\n`;
		const math = (i: number) => `$$\nS_${i} = \\frac{n(n+1)}{2}\n$$\n\n`;
		const part1 = para(1) + math(1) + para(2);
		act(() => {
			root.render(<MarkdownContent {...environment} text={part1} isStreamingTail />);
		});
		act(() => {
			vi.advanceTimersByTime(1200);
		});
		expect(container.textContent).toContain("Problem 1");

		const finalText = part1 + math(2) + para(3);
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
		expect(container.textContent).toContain("Problem 3");

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

	it("括号块乐观冻结后定义行中途到达：同帧重置且最终链接正确解析", () => {
		// 阶段 1：无定义——括号块乐观冻结（渲染为字面 [label]，与全量解析一致）。
		const before = "Uses [label] and [label][ref] here.\n\nplain paragraph.\n\n";
		act(() => {
			root.render(<MarkdownContent {...environment} text={before} isStreamingTail />);
		});
		act(() => {
			vi.advanceTimersByTime(1200);
		});
		expect(container.textContent).toContain("[label]");

		// 阶段 2：定义行到达——同帧重置重拆，此前冻结块回到 tail。
		const mid = `${before}[label]: https://example.com/defined\n`;
		act(() => {
			root.render(<MarkdownContent {...environment} text={mid} isStreamingTail />);
		});
		act(() => {
			vi.advanceTimersByTime(1200);
		});

		// 阶段 3：再补第二个定义与结尾，最终链接必须正确解析且与整篇渲染等价。
		const finalText = `${mid}[ref]: https://example.com/other\n\nafter definitions.\n`;
		act(() => {
			root.render(<MarkdownContent {...environment} text={finalText} isStreamingTail={false} />);
		});
		act(() => {
			vi.advanceTimersByTime(4000);
		});
		const link = container.querySelector("a");
		expect(link?.getAttribute("href")).toBe("https://example.com/defined");

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

	it("中文内容与含数学/代码跨格的表格流式正确且最终等价", () => {
		const header = "| 名称 | 说明 | 数值 |\n| --- | --- | ---: |\n";
		const rows = [
			"| 方案甲 | 中文说明第一行，含 **加粗** 与 `代码` | 1 |",
			"| 方案乙 | 单元格内数学 $E=mc^2$ 与转义管道 \| 测试 | 2 |",
			"| 方案丙 | 组合：**粗体**内嵌 $x_i^2$ 与 `a|b` 跨格 | 3 |",
		];
		// 行文本循环复用：同时覆盖重复行文本下回放克隆的跨位共享。
		const body = Array.from({ length: 100 }, (_, i) => `${rows[i % rows.length]}\n`).join("");
		const text = "中文引言段落。\n\n" + header + body + "\n表格结束。\n";
		act(() => {
			root.render(<MarkdownContent {...environment} text={"中文引言段落。\n\n" + header + body} isStreamingTail />);
		});
		act(() => {
			vi.advanceTimersByTime(1500);
		});
		expect(container.querySelectorAll("tbody tr").length).toBe(100);
		expect(container.textContent).toContain("方案甲");

		act(() => {
			root.render(<MarkdownContent {...environment} text={text} isStreamingTail={false} />);
		});
		act(() => {
			vi.advanceTimersByTime(4000);
		});
		expect(container.textContent).toContain("表格结束。");

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
			const body2 = clone.querySelector(".markdown-body") ?? clone;
			return [...body2.children].map((node) => node.outerHTML).join("");
		};
		const streamedHtml = normalize(container);
		const plainHtml = normalize(plainContainer);
		act(() => plainRoot.unmount());
		plainContainer.remove();
		expect(streamedHtml).toBe(plainHtml);
	});

	it("CRLF 输入的大表与围栏流式正确且最终等价", () => {
		const toCrlf = (text: string): string => text.replace(/\n/g, "\r\n");
		const header = "| Name | Description | Value |\r\n| --- | --- | ---: |\r\n";
		const tableBody = Array.from(
			{ length: 120 },
			(_, i) => `| Item ${i} | A detailed description of this record ${i} | ${i} |\r\n`,
		).join("");
		const fence = "```ts\r\n" + Array.from({ length: 200 }, (_, i) => `const v${i} = ${i};\r\n`).join("");
		const text = toCrlf("Intro line.\n\n") + header + tableBody + toCrlf("\nafter table.\n\n") + fence + "```\r\n\r\ndone.\r\n";

		act(() => {
			root.render(<MarkdownContent {...environment} text={header + tableBody} isStreamingTail />);
		});
		act(() => {
			vi.advanceTimersByTime(1500);
		});
		const streamedRows = container.querySelectorAll("tbody tr").length;
		act(() => {
			root.render(<MarkdownContent {...environment} text={text} isStreamingTail />);
		});
		act(() => {
			vi.advanceTimersByTime(4000);
		});
		act(() => {
			root.render(<MarkdownContent {...environment} text={text} isStreamingTail={false} />);
		});
		act(() => {
			vi.advanceTimersByTime(4000);
		});
		expect(streamedRows).toBe(120);
		expect(container.textContent).toContain("after table.");
		expect(container.textContent).toContain("const v199");
		expect(container.textContent).toContain("done.");

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
