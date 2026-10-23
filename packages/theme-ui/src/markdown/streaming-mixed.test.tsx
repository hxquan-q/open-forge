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

	it("纯长引用流式：快路径段缓存且最终等价", () => {
		const para = (i: number) => `> quoted passage ${i} with some emphasis and detail in the cited material.\n>\n`;
		const initial = Array.from({ length: 120 }, (_, i) => para(i)).join("");
		act(() => {
			root.render(<MarkdownContent {...environment} text={initial} isStreamingTail />);
		});
		act(() => {
			vi.advanceTimersByTime(1500);
		});
		expect(container.querySelectorAll("blockquote p").length).toBeGreaterThanOrEqual(119);

		const finalText = initial + "> appended quoted passage at the end.\n";
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
		expect(container.textContent).toContain("appended quoted passage");

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

	it("连续同类构造压力变体：每形态相邻重复且带类型切换", () => {
		const t1 = "| A | B |\n| --- | --- |\n" + Array.from({ length: 30 }, (_, i) => `| a${i} | b${i} |\n`).join("");
		const t2 = "| X | Y | Z |\n| --- | --- | ---: |\n" + Array.from({ length: 30 }, (_, i) => `| x${i} | y${i} | ${i} |\n`).join("");
		const l1 = Array.from({ length: 30 }, (_, i) => `- dash ${i}\n`).join("");
		const l2 = Array.from({ length: 30 }, (_, i) => `* star ${i}\n`).join("");
		const l3 = Array.from({ length: 30 }, (_, i) => `${i + 1}. ordered ${i}\n`).join("");
		const f1 = "```js\n" + Array.from({ length: 60 }, (_, i) => `let a${i} = ${i};\n`).join("") + "```\n\n";
		const f2 = "~~~python\n" + Array.from({ length: 60 }, (_, i) => `b${i} = ${i}\n`).join("") + "~~~\n\n";
		const m1 = Array.from({ length: 8 }, (_, i) => `$$\nM1_${i}\n$$\n\n`).join("");
		const m2 = Array.from({ length: 8 }, (_, i) => `$$\nM2_${i} = \\alpha_{${i}}\n$$\n\n`).join("");
		const d1 = Array.from({ length: 6 }, (_, i) => `<details><summary>DA${i}</summary>\n\nx${i}\n\n</details>\n\n`).join("");
		const d2 = Array.from({ length: 6 }, (_, i) => `<div>div${i}\n<span>s${i}</span>\n</div>\n\n`).join("");

		const stages = [
			t1,
			t1 + "\nsep\n\n" + t2,
			t1 + "\nsep\n\n" + t2 + "\n" + l1,
			t1 + "\nsep\n\n" + t2 + "\n" + l1 + "\n" + l2 + "\n" + l3,
			t1 + "\nsep\n\n" + t2 + "\n" + l1 + "\n" + l2 + "\n" + l3 + "\n\n" + f1,
			t1 + "\nsep\n\n" + t2 + "\n" + l1 + "\n" + l2 + "\n" + l3 + "\n\n" + f1 + f2,
			t1 + "\nsep\n\n" + t2 + "\n" + l1 + "\n" + l2 + "\n" + l3 + "\n\n" + f1 + f2 + m1,
			t1 + "\nsep\n\n" + t2 + "\n" + l1 + "\n" + l2 + "\n" + l3 + "\n\n" + f1 + f2 + m1 + m2,
			t1 + "\nsep\n\n" + t2 + "\n" + l1 + "\n" + l2 + "\n" + l3 + "\n\n" + f1 + f2 + m1 + m2 + d1,
			t1 + "\nsep\n\n" + t2 + "\n" + l1 + "\n" + l2 + "\n" + l3 + "\n\n" + f1 + f2 + m1 + m2 + d1 + d2 + "end.\n",
		];
		const env2 = environment;
		let text = "";
		for (const stage of stages) {
			text = stage;
			act(() => {
				root.render(<MarkdownContent {...env2} text={text} isStreamingTail />);
			});
			act(() => {
				vi.advanceTimersByTime(1500);
			});
		}
		act(() => {
			root.render(<MarkdownContent {...env2} text={text} isStreamingTail={false} />);
		});
		act(() => {
			vi.advanceTimersByTime(4000);
		});
		expect(container.querySelectorAll("tbody").length).toBe(2);
		expect(container.querySelectorAll("ul").length).toBeGreaterThanOrEqual(2);
		expect(container.querySelector("ol")).toBeTruthy();
		expect(container.textContent).toContain("end.");

		const plainContainer = document.createElement("div");
		const plainRoot = createRoot(plainContainer);
		document.body.append(plainContainer);
		act(() => {
			plainRoot.render(<MarkdownContent {...env2} text={text} isStreamingTail={false} />);
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

	it("八形态全混合消息渐进流式：全程正确且最终整篇等价", () => {
		const para = (i: number) => `Mixed intro paragraph ${i} with **bold** and [inline](https://e.com/${i}).\n\n`;
		const table = (n: number) => `| Name | Desc | V |\n| --- | --- | ---: |\n${Array.from({ length: n }, (_, i) => `| row ${i} | description ${i} | ${i} |\n`).join("")}`;
		const fence = (n: number) => `\`\`\`ts\n${Array.from({ length: n }, (_, i) => `const v${i} = ${i};\n`).join("")}\`\`\`\n\n`;
		const math = (n: number) => Array.from({ length: n }, (_, i) => `$$\nS_${i} = \\frac{n(${i})}{2}\n$$\n\n`).join("");
		const list = (n: number) => Array.from({ length: n }, (_, i) => `- list item ${i} with detail.\n`).join("");
		const task = (n: number) => Array.from({ length: n }, (_, i) => `- [${i % 2 ? "x" : " "}] todo ${i}.\n`).join("");
		const details = (n: number) => Array.from({ length: n }, (_, i) => `<details><summary>D${i}</summary>\n\nbody ${i}.\n\n</details>\n\n`).join("");
		const bracket = (n: number) => Array.from({ length: n }, (_, i) => `Config arr[${i}] and keys[${i}] documented.\n\n`).join("");

		// 渐进渲染：每阶段追加一种形态（覆盖所有快路径与冻结机制的交替启用/退出）。
		const stages = [
			para(0) + table(8),
			table(40),
			para(1) + fence(60),
			fence(200) + math(6),
			math(30) + list(80),
			list(150) + task(40),
			task(60) + details(6),
			details(20) + bracket(40),
			bracket(80) + "Final closing paragraph.\n",
		];
		let text = "";
		for (const stage of stages) {
			text += stage;
			act(() => {
				root.render(<MarkdownContent {...environment} text={text} isStreamingTail />);
			});
			act(() => {
				vi.advanceTimersByTime(1200);
			});
		}
		act(() => {
			root.render(<MarkdownContent {...environment} text={text} isStreamingTail={false} />);
		});
		act(() => {
			vi.advanceTimersByTime(4000);
		});
		expect(container.textContent).toContain("Final closing paragraph.");

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

	it("任务列表（GFM checkbox）流式正确且最终等价", () => {
		const line = (i: number) => `- [${i % 3 === 0 ? "x" : " "}] task ${i}: a checklist item with detail text.\n`;
		const initial = Array.from({ length: 120 }, (_, i) => line(i)).join("");
		act(() => {
			root.render(<MarkdownContent {...environment} text={initial} isStreamingTail />);
		});
		act(() => {
			vi.advanceTimersByTime(1500);
		});
		const finalText = initial + "- [ ] appended task.\n";
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
		expect(container.textContent).toContain("task 119");

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

	it("有序/loose/嵌套/多行项列表流式正确且最终等价", () => {
		const ol = Array.from({ length: 100 }, (_, i) => `${i + 5}. step ${i} of the ordered flow.\n`).join("");
		const loose = Array.from({ length: 60 }, (_, i) => `- loose ${i}\n\n`).join("");
		const nested = Array.from(
			{ length: 40 },
			(_, i) => `- top ${i}\n  - nested ${i}a\n  - nested ${i}b\n`,
		).join("");
		const multi = Array.from({ length: 40 }, (_, i) => `- multi ${i}\n  continued line ${i}\n`).join("");
		const texts = { ol, loose, nested, multi };
		for (const [name, text] of Object.entries(texts)) {
			act(() => {
				root.render(<MarkdownContent {...environment} text={text} isStreamingTail />);
			});
			act(() => {
				vi.advanceTimersByTime(1500);
			});
			const grown = text + (name === "ol" ? "105. appended step.\n" : `- appended ${name} item.\n`);
			act(() => {
				root.render(<MarkdownContent {...environment} text={grown} isStreamingTail />);
			});
			act(() => {
				vi.advanceTimersByTime(4000);
			});
			act(() => {
				root.render(<MarkdownContent {...environment} text={grown} isStreamingTail={false} />);
			});
			act(() => {
				vi.advanceTimersByTime(4000);
			});
			const plainContainer = document.createElement("div");
			const plainRoot = createRoot(plainContainer);
			document.body.append(plainContainer);
			act(() => {
				plainRoot.render(<MarkdownContent {...environment} text={grown} isStreamingTail={false} />);
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
			if (name === "ol") {
				// 宿主 ol 组件不透传 start 属性（预存行为，两路径一致）；
				// 编号按 DOM 位置由 CSS 生成，缓存项保位即可保号。
				expect(container.querySelectorAll("ol li").length).toBe(101);
			}
		}

	});

	it("纯长列表流式：快路径项缓存且最终等价", () => {
		const line = (i: number) => `- item ${i}: a detailed bullet point describing step ${i} with detail.\n`;
		const initial = Array.from({ length: 120 }, (_, i) => line(i)).join("");
		act(() => {
			root.render(<MarkdownContent {...environment} text={initial} isStreamingTail />);
		});
		act(() => {
			vi.advanceTimersByTime(1200);
		});
		expect(container.querySelectorAll("li").length).toBe(120);

		const finalText = initial + line(120) + line(121);
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
		expect(container.querySelectorAll("li").length).toBe(122);

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
