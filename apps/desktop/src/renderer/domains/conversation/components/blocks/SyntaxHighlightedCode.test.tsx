// Modified by The Open Forge contributors.
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { codeToHtml } = vi.hoisted(() => ({
	codeToHtml: vi.fn(async (_code: string, _options: unknown) => "<pre>highlighted</pre>"),
}));
vi.mock("shiki", () => ({
	codeToHtml,
}));

const { SyntaxHighlightedCode } = await import("@vetta-org/theme-ui/shared");
const { MarkdownContent } = await import("@vetta-org/theme-ui/markdown");

describe("SyntaxHighlightedCode", () => {
	beforeEach(() => {
		codeToHtml.mockClear();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("流式 live 块只渲染等宽纯文本，不调用 Shiki", async () => {
		const { container } = render(
			<SyntaxHighlightedCode code="const a = 1;" lang="ts" theme="dark" live />,
		);
		expect(container.textContent).toContain("const a = 1;");
		await Promise.resolve();
		expect(codeToHtml).not.toHaveBeenCalled();
	});

	it("非 live 且没有 IntersectionObserver 时会请求高亮", async () => {
		const { container } = render(
			<SyntaxHighlightedCode code={"unique-live-skip " + Math.random()} lang="ts" theme="dark" />,
		);
		await waitFor(() => expect(codeToHtml).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(container.innerHTML).toContain("highlighted"));
	});

	it("缓存条目被挤出后，仍挂载的代码块会重新高亮自愈", async () => {
		// 缓存按插入序 FIFO、条数上限淘汰：A 高亮后渲染 301 个不同代码块把 A
		// 挤出。仍挂载的 A 在下一次重渲染读到 null 后必须重新高亮，而不是永久
		// 停留在纯文本（html 进 effect 依赖就是为这条路径）。30k 预算闸已禁
		// 大块高亮，驱逐改由条数上限触发。
		const codeA = "const a = 1;";
		const callsFor = (code: string) => codeToHtml.mock.calls.filter(([arg]) => arg === code).length;

		const { container: containerA, rerender } = render(
			<SyntaxHighlightedCode code={codeA} lang="ts" theme="dark" />,
		);
		await waitFor(() => expect(containerA.innerHTML).toContain("highlighted"));
		expect(callsFor(codeA)).toBe(1);

		for (let index = 0; index < 301; index += 1) {
			render(<SyntaxHighlightedCode code={`const filler = ${index};`} lang="ts" theme="dark" />);
		}
		await waitFor(() =>
			expect(callsFor("const filler = 300;")).toBeGreaterThanOrEqual(1),
		);

		// 同一挂载实例的父级重渲染（非重挂载）：旧实现无 html 依赖，effect 不重跑。
		rerender(<SyntaxHighlightedCode code={codeA} lang="ts" theme="dark" />);
		await waitFor(() => expect(callsFor(codeA)).toBe(2));
		await waitFor(() => expect(containerA.innerHTML).toContain("highlighted"));
	});

	describe.each([
		["total size", `${"x".repeat(1000)}\n`.repeat(31)],
		["line count", "x\n".repeat(1001)],
		["long line", "x".repeat(2001)],
	])("超预算代码", (_name, code) => {
		it("保持完整可复制，不触发语法高亮", async () => {
			const writeText = vi.fn(async () => {});
			Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
			const view = render(
				<MarkdownContent
					theme="dark"
					labels={{ copy: "Copy", copied: "Copied" }}
					getFileIconClass={() => ""}
					onOpenFile={() => {}}
					onOpenUrl={() => {}}
					text={`\`\`\`ts\n${code}\n\`\`\``}
				/>,
			);
			expect(view.container.querySelector("code")?.textContent).toContain(code.slice(0, 50));
			fireEvent.click(screen.getByRole("button", { name: "Copy" }));
			await waitFor(() => expect(writeText).toHaveBeenCalled());
			expect(codeToHtml).not.toHaveBeenCalled();
		});
	});
});
