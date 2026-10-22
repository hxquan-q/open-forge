// @vitest-environment jsdom
// Modified by The Open Forge contributors.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownContent } from "./MarkdownContent";
import { detectGrowingFence } from "./tail-fence";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const environment = {
	theme: "dark" as const,
	labels: { copy: "Copy code", copied: "Copied code" },
	getFileIconClass: () => "",
	onOpenFile: () => {},
	onOpenUrl: () => {},
};

/** 流式渲染与历史渲染的差异只允许来自流式装饰（分段 span / 尾部类），展开后必须一致。 */
function normalize(container: HTMLElement): string {
	const clone = container.cloneNode(true) as HTMLElement;
	for (const span of [...clone.querySelectorAll("span.streaming-chunk")]) {
		span.replaceWith(...[...span.childNodes]);
	}
	const body = clone.querySelector(".markdown-body") ?? clone;
	return [...body.children].map((node) => node.outerHTML).join("");
}

function makeFence(lines: number, closeIt: (text: string) => string = (t) => t): string {
	const body = Array.from({ length: lines }, (_, i) => `const item${i} = { value: ${i}, label: "example" };\n`).join("");
	return closeIt(`\`\`\`ts\n${body}`);
}

describe("detectGrowingFence", () => {
	it("识别未闭合顶层围栏：语言与内容", () => {
		const shape = detectGrowingFence(makeFence(1200));
		expect(shape).not.toBeNull();
		expect(shape?.lang).toBe("ts");
		expect(shape?.content).toContain("const item0");
		expect(shape?.content).toContain(`const item1199`);
		expect(shape?.content.endsWith(";\n")).toBe(true);
	});

	it("已闭合、含 CRLF、缩进开栏、info 含反引号或太小的尾块不启用", () => {
		expect(detectGrowingFence(makeFence(1200, (t) => `${t}\`\`\`\n`))).toBeNull();
		expect(detectGrowingFence(makeFence(1200).replace(/\n/g, "\r\n"))).toBeNull();
		expect(detectGrowingFence(`  \`\`\`ts\n${"code\n".repeat(5000)}`)).toBeNull();
		expect(detectGrowingFence(`\`\`\`ts\`oops\n${"code\n".repeat(5000)}`)).toBeNull();
		expect(detectGrowingFence(makeFence(100))).toBeNull();
	});
});

describe("TailFenceDocument 未闭合围栏直渲染", () => {
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

	it("流式期间完整渲染围栏内容，闭合后与常规路径等价", () => {
		const open = makeFence(1200);
		act(() => {
			root.render(<MarkdownContent {...environment} text={open} isStreamingTail />);
		});
		act(() => {
			vi.advanceTimersByTime(4000);
		});
		const body = container.querySelector(".markdown-body");
		expect(body?.textContent).toContain("const item0");
		expect(body?.textContent).toContain("const item1199");

		// 流结束（围栏闭合 + 后随正文）：围栏冻结为常规路径渲染的代码块。
		const closed = `${open}\`\`\`\n\nafter code fence.\n`;
		act(() => {
			root.render(<MarkdownContent {...environment} text={closed} isStreamingTail={false} />);
		});
		act(() => {
			vi.advanceTimersByTime(4000);
		});
		const streamedHtml = normalize(container);

		const plainContainer = document.createElement("div");
		const plainRoot = createRoot(plainContainer);
		document.body.append(plainContainer);
		act(() => {
			plainRoot.render(<MarkdownContent {...environment} text={closed} isStreamingTail={false} />);
		});
		const plainHtml = normalize(plainContainer);
		act(() => plainRoot.unmount());
		plainContainer.remove();

		expect(streamedHtml).toBe(plainHtml);
	});
});
