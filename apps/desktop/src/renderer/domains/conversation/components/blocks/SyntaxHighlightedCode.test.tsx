// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { codeToHtml } = vi.hoisted(() => ({
	codeToHtml: vi.fn(async (_code: string, _options: unknown) => "<pre>highlighted</pre>"),
}));
vi.mock("shiki", () => ({
	codeToHtml,
}));

const { SyntaxHighlightedCode } = await import("@vetta-org/theme-ui/shared");

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

	it("缓存条目被字符预算挤出后，仍挂载的代码块会重新高亮自愈", async () => {
		// 两个 ~3M 字符的代码块：key 含源码全文，第二条入缓存即超出 5M 字符预算，
		// 把第一条挤出。仍挂载的第一条在下一次重渲染读到 null 后必须重新高亮，
		// 而不是永久停留在纯文本（html 进 effect 依赖就是为这条路径）。
		const bigA = `a${"x".repeat(3_000_000)}`;
		const bigB = `b${"x".repeat(3_000_000)}`;
		const callsFor = (code: string) => codeToHtml.mock.calls.filter(([arg]) => arg === code).length;

		const { container: containerA, rerender } = render(
			<SyntaxHighlightedCode code={bigA} lang="ts" theme="dark" />,
		);
		await waitFor(() => expect(containerA.innerHTML).toContain("highlighted"));
		expect(callsFor(bigA)).toBe(1);

		const { container: containerB } = render(
			<SyntaxHighlightedCode code={bigB} lang="ts" theme="dark" />,
		);
		await waitFor(() => expect(containerB.innerHTML).toContain("highlighted"));
		expect(callsFor(bigB)).toBe(1);

		// 同一挂载实例的父级重渲染（非重挂载）：旧实现无 html 依赖，effect 不重跑。
		rerender(<SyntaxHighlightedCode code={bigA} lang="ts" theme="dark" />);
		await waitFor(() => expect(callsFor(bigA)).toBe(2));
		await waitFor(() => expect(containerA.innerHTML).toContain("highlighted"));
	});
});
