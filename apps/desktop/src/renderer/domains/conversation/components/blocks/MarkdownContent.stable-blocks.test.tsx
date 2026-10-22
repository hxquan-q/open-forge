// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { MarkdownContent } from "@vetta-org/theme-ui/markdown";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const environment = {
	theme: "dark" as const,
	labels: { copy: "Copy code", copied: "Copied code" },
	getFileIconClass: () => "",
	onOpenFile: () => {},
	onOpenUrl: () => {},
};

describe("MarkdownContent 稳定块冻结", () => {
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

	it("流式追加时已闭合围栏前的正文节点保持身份，只有尾块继续增长", () => {
		const prefix = "Hello frozen paragraph.\n\n```js\nconst a = 1;\n```\n\n";
		const view = render(
			<MarkdownContent {...environment} text={`${prefix}Beta`} isStreamingTail />,
		);
		act(() => {
			vi.advanceTimersByTime(4000);
		});
		const first = screen.getByText("Hello frozen paragraph.");
		view.rerender(
			<MarkdownContent {...environment} text={`${prefix}Beta continues now.`} isStreamingTail />,
		);
		act(() => {
			vi.advanceTimersByTime(4000);
		});
		expect(screen.getByText("Hello frozen paragraph.")).toBe(first);
		expect(screen.getByText(/Beta continues now/)).toBeTruthy();
	});

	it("没有围栏的流式回复中，已完成段落也冻结并保持节点身份", () => {
		const view = render(
			<MarkdownContent {...environment} text={"Alpha one.\n\nBeta"} isStreamingTail />,
		);
		act(() => {
			vi.advanceTimersByTime(4000);
		});
		const alpha = screen.getByText("Alpha one.");
		view.rerender(
			<MarkdownContent {...environment} text={"Alpha one.\n\nBeta grows with more words."} isStreamingTail />,
		);
		act(() => {
			vi.advanceTimersByTime(4000);
		});
		expect(screen.getByText("Alpha one.")).toBe(alpha);
		expect(screen.getByText(/Beta grows with more words/)).toBeTruthy();
	});

	it("流式结束后冻结块节点保持身份，已展示文本不再重新包成淡入片段", () => {
		const prefix = "Hello frozen paragraph.\n\n```js\nconst a = 1;\n```\n\n";
		const text = `${prefix}Beta continues now.`;
		const view = render(<MarkdownContent {...environment} text={text} isStreamingTail />);
		act(() => {
			vi.advanceTimersByTime(4000);
		});
		const frozen = screen.getByText("Hello frozen paragraph.");
		const frozenCode = view.container.querySelector("pre, code");
		const tail = screen.getByText(/Beta continues now/);
		const chunksBefore = view.container.querySelectorAll(".streaming-chunk").length;
		expect(chunksBefore).toBeGreaterThan(0);

		// 尾块翻为非流式的那一刻：settle 尚未到期，animateChunks 仍为 true。
		view.rerender(<MarkdownContent {...environment} text={text} isStreamingTail={false} />);
		expect(screen.getByText("Hello frozen paragraph.")).toBe(frozen);
		expect(view.container.querySelector("pre, code")).toBe(frozenCode);
		expect(screen.getByText(/Beta continues now/)).toBe(tail);
		expect(view.container.querySelectorAll(".streaming-chunk").length).toBe(chunksBefore);

		// settle 之后撤掉「最新短语略暗」的包裹类；分段 span 按设计保留到实例卸载，
		// 撤掉 rehype 分段会让已上屏的尾块整段重挂、再包成 .streaming-chunk 重放淡入。
		act(() => {
			vi.advanceTimersByTime(4000);
		});
		expect(screen.getByText("Hello frozen paragraph.")).toBe(frozen);
		expect(view.container.querySelector("pre, code")).toBe(frozenCode);
		expect(view.container.querySelectorAll(".streaming-chunk").length).toBe(chunksBefore);
		expect(view.container.querySelector(".markdown-streaming-tail")).toBeNull();
	});

	it("从未流式过的历史消息仍按单一文档渲染", () => {
		const text = "Hello.\n\n```js\nconst a = 1;\n```\n\nAfter";
		const view = render(<MarkdownContent {...environment} text={text} isStreamingTail={false} />);
		expect(screen.getByText("Hello.")).toBeTruthy();
		expect(screen.getByText("After")).toBeTruthy();
		expect(view.container.querySelector(".streaming-chunk")).toBeNull();
		expect(view.container.querySelector(".markdown-streaming-tail")).toBeNull();
	});
});
