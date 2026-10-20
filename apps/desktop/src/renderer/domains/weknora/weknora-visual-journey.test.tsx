// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { DesktopApi, WeKnoraAgent, WeKnoraSession, WeKnoraStreamEvent } from "@preload/api";
import { i18n, initI18n } from "@shared/i18n";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { WeKnoraChatMessage } from "./atoms";
import { MessageBubble } from "./components/MessageBubble";
import { WeKnoraPage } from "./components/WeKnoraPage";

/**
 * 视觉打磨（REQ-0019）的**用户流程级**独立用例（③ 测试相位自建）。
 *
 * 沿真实用户路径把「提问 → 等待首字 → 首字到达 → 生成中收起侧栏 → 完成」串成一条链，
 * 每步断言**结果**（而非「点击成功」）。角度与实现者自建的组件级用例不同：这里走整页装配 +
 * 假后端 + 真实流事件，覆盖跨组件接线（组件级用例证不了「接上线了没有」）。
 *
 * jsdom 不跑真实布局与动画帧，故只断言「可验证事实」（动画类/元素的存在与消失、
 * 逐字节文本一致性、DOM 挂载/卸载）；观感留实机验收。
 */

vi.mock("@shared/components/RendererMarkdownContent", () => ({
	RendererMarkdownContent: ({ text }: { text: string }) => <div data-testid="weknora-markdown">{text}</div>,
}));

vi.mock("@shared/components/ui/select", () => ({
	Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectTrigger: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => (
		<div {...props}>{children}</div>
	),
	SelectValue: () => <span />,
	SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
		<button type="button" data-value={value}>
			{children}
		</button>
	),
}));

type WeKnoraApi = DesktopApi["weknora"];

const CONFIGURED = { baseUrl: "http://host:8083", defaultAgentId: "", pageSize: 50, hasApiKey: true };
/** 退出动画（实现里 SIDEBAR_ANIMATION_MS = 200）加余量，等它播完再断言终态。 */
const ANIMATION_SETTLE_MS = 260;
const DOTS_SELECTOR = ".weknora-thinking-dot-1, .weknora-thinking-dot-2, .weknora-thinking-dot-3";

function agent(id: string): WeKnoraAgent {
	return { id, name: `Agent ${id}` };
}

interface Harness {
	readonly api: WeKnoraApi;
	readonly emit: (event: WeKnoraStreamEvent) => void;
}

/** 已配置 + 智能体就绪的假后端；捕获流事件处理器，供用例按需投递事件。 */
function installApi(): Harness {
	let handler: ((event: WeKnoraStreamEvent) => void) | null = null;
	const api: WeKnoraApi = {
		getConfig: vi.fn(async () => CONFIGURED),
		setConfig: vi.fn(async () => undefined),
		setApiKey: vi.fn(async () => undefined),
		listAgents: vi.fn(async () => [agent("A"), agent("B")]),
		listSessions: vi.fn(
			async () => [{ id: "s1", title: "会话一", updated_at: "2026-10-19T09:00:00" }] satisfies WeKnoraSession[],
		),
		loadMessages: vi.fn(async () => []),
		deleteSession: vi.fn(async () => undefined),
		getChunk: vi.fn(async () => ({ content: "chunk" })),
		ask: vi.fn(async () => ({ requestId: "r1", sessionId: "s1" })),
		cancel: vi.fn(async () => undefined),
		onStreamEvent: vi.fn((next: (event: WeKnoraStreamEvent) => void) => {
			handler = next;
			return () => {
				handler = null;
			};
		}),
	};
	Object.defineProperty(window, "vetta", {
		configurable: true,
		writable: true,
		value: { weknora: api } as unknown as DesktopApi,
	});
	return { api, emit: (event) => handler?.(event) };
}

function renderPage(): ReturnType<typeof render> {
	return render(
		<Provider store={createStore()}>
			<WeKnoraPage />
		</Provider>,
	);
}

async function waitReady(): Promise<void> {
	await waitFor(() => expect(screen.getByRole("button", { name: "Agent A" })).toBeTruthy());
}

function toggleButton(): HTMLButtonElement {
	return screen.getByRole("button", { name: /历史会话/ }) as HTMLButtonElement;
}

async function ask(text: string): Promise<void> {
	const user = userEvent.setup();
	await user.type(screen.getByPlaceholderText("输入你的问题…"), text);
	await user.click(screen.getByRole("button", { name: "发送" }));
	await act(async () => {
		await Promise.resolve();
	});
}

async function settleAnimation(): Promise<void> {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, ANIMATION_SETTLE_MS));
	});
}

/** 内容行（页头与拖拽区之外的直接子元素）：收起终态「不占宽」就断言在它的直接子元素数上。 */
function contentRow(container: HTMLElement): HTMLElement {
	const root = container.firstElementChild as HTMLElement;
	const header = root.querySelector("header");
	return Array.from(root.children).find(
		(child) => child !== header && !child.classList.contains("drag-region"),
	) as HTMLElement;
}

/** 「思考中」三点容器（由装饰点类名上溯两级）；文案「思考中」在侧栏行指示里也会出现，故必须限定作用域。 */
function dotsWrapper(container: HTMLElement): HTMLElement | null {
	const dot = container.querySelector(".weknora-thinking-dot-1");
	return (dot?.parentElement?.parentElement as HTMLElement | undefined) ?? null;
}

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

afterEach(() => {
	localStorage.clear();
});

describe("智能客服 · 视觉打磨用户流程（AC-4/5/6/7/8/10/11）", () => {
	it("全流程：提问 → 三点 → 首字 → 生成中收起侧栏 → 完成，终态 Markdown 与流式全文逐字节一致", async () => {
		const harness = installApi();
		const { container } = renderPage();
		await waitReady();

		// ① 提问后、首字到达前：助手位置显示三点 +「思考中」，且尚无逐字 span。
		await ask("问题一");
		expect(container.querySelectorAll(DOTS_SELECTOR)).toHaveLength(3);
		expect(dotsWrapper(container)?.textContent).toContain("思考中");
		expect(container.querySelectorAll(".weknora-stream-char")).toHaveLength(0);

		// ② 首个字符到达：三点消失，逐字文本接管。
		act(() => harness.emit({ type: "turn.started", requestId: "r1", sessionId: "s1" }));
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "甲" }));
		expect(container.querySelectorAll(DOTS_SELECTOR)).toHaveLength(0);
		expect(container.querySelectorAll(".weknora-stream-char")).toHaveLength(1);
		expect(screen.getByText("甲")).toBeTruthy();

		// ③ 生成中收起侧栏：先进入过渡（槽仍在 DOM，但对辅助技术已收起）。
		const row = contentRow(container);
		expect(row.children).toHaveLength(2);
		await userEvent.setup().click(toggleButton());
		expect(row.children).toHaveLength(2); // 过渡期槽仍在（证明是动画而非硬切）
		expect(screen.queryByRole("navigation", { name: "历史会话" })).toBeNull();

		// ④ 动画结束：整栏从 DOM 卸载，不占宽（内容行只剩消息列一个直接子元素）。
		await settleAnimation();
		expect(row.children).toHaveLength(1);
		expect(screen.queryByRole("navigation", { name: "历史会话", hidden: true })).toBeNull();

		// ⑤ 收起侧栏不影响生成：继续流式追加。
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "乙丙" }));
		expect(screen.getByText("甲乙丙")).toBeTruthy();

		// ⑥ 完成：终态 Markdown 逐字节等于流式全文；动画类消失、三点不残留。
		act(() => harness.emit({ type: "answer.promoted", requestId: "r1", promotedLength: "甲乙丙".length }));
		act(() => harness.emit({ type: "turn.completed", requestId: "r1" }));
		await waitFor(() => expect(screen.getByTestId("weknora-markdown").textContent).toBe("甲乙丙"));
		expect(container.querySelectorAll(".weknora-stream-char")).toHaveLength(0);
		expect(container.querySelectorAll(DOTS_SELECTOR)).toHaveLength(0);
	});

	it("AC-6：只有本次生成中的增量带动画；已完成的历史消息与用户消息恒不带动画", async () => {
		const harness = installApi();
		const { container } = renderPage();
		await waitReady();

		// 第一轮：流式 → 完成（转为「历史」消息）。
		await ask("第一问");
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "第一答" }));
		act(() => harness.emit({ type: "answer.promoted", requestId: "r1", promotedLength: "第一答".length }));
		act(() => harness.emit({ type: "turn.completed", requestId: "r1" }));
		await waitFor(() => expect(screen.getByTestId("weknora-markdown").textContent).toBe("第一答"));

		// 第二轮：新一轮流式。
		await ask("第二问");
		act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: "第二答" }));

		// 全页逐字 span 数 == 仅第二轮流式消息的字符数（第一轮 + 两条用户消息都不贡献）。
		expect(container.querySelectorAll(".weknora-stream-char")).toHaveLength("第二答".length);
		// 已完成（历史）的助手消息走 Markdown 渲染，无逐字 span。
		expect(screen.getByTestId("weknora-markdown").querySelectorAll(".weknora-stream-char")).toHaveLength(0);
		// 用户消息是普通 <p>，无逐字 span。
		expect(screen.getByText("第二问").querySelectorAll(".weknora-stream-char")).toHaveLength(0);
	});

	it("AC-5：多 delta（含 emoji 代理对）流式全文与终态 Markdown 逐字节一致", async () => {
		const harness = installApi();
		const { container } = renderPage();
		await waitReady();
		await ask("含 emoji 的问");

		const deltas = ["第一段。带 ", "emoji 😀 ", "的回答，还有中文标点。"];
		const full = deltas.join("");
		act(() => harness.emit({ type: "turn.started", requestId: "r1", sessionId: "s1" }));
		for (const delta of deltas) act(() => harness.emit({ type: "answer.delta", requestId: "r1", text: delta }));

		// 流式期间可见文本 == 源文本（逐字节一致）。
		expect(screen.getByText(full)).toBeTruthy();

		act(() => harness.emit({ type: "answer.promoted", requestId: "r1", promotedLength: full.length }));
		act(() => harness.emit({ type: "turn.completed", requestId: "r1" }));

		await waitFor(() => expect(screen.getByTestId("weknora-markdown").textContent).toBe(full));
		// 代理对没被切坏：终态文本不含替换字符。
		expect(container.textContent?.includes("�")).toBe(false);
	});

	it("AC-7/AC-8：首字到达前取消 → 三点消失、不残留，消息标「已取消」", async () => {
		installApi();
		const { container } = renderPage();
		await waitReady();

		await ask("会被取消的问题");
		expect(container.querySelectorAll(DOTS_SELECTOR)).toHaveLength(3);

		await userEvent.setup().click(screen.getByRole("button", { name: "取消" }));

		// 终态（取消）：三点不残留、无逐字 span，状态文案可见。
		expect(container.querySelectorAll(DOTS_SELECTOR)).toHaveLength(0);
		expect(container.querySelectorAll(".weknora-stream-char")).toHaveLength(0);
		expect(screen.getByText("已取消")).toBeTruthy();
	});
});

describe("AC-5 · 尾部窗口的代理对边界（组件级补强）", () => {
	it("窗口起点落在 emoji 低代理项时不切坏字符，可见文本仍逐字节一致", () => {
		// 构造：尾部窗口起点（length - 64）恰好落在 emoji 的低代理项上，触发实现里的边界回退。
		// 若回退失效，首个逐字 span 会是一个孤立低代理项（渲染成方块 / 断字）。
		const text = `${"a".repeat(5)}😀${"b".repeat(63)}`;
		const message: WeKnoraChatMessage = { id: "a1", role: "assistant", text, thinking: "", status: "streaming" };
		const { container } = render(<MessageBubble message={message} />);

		// 首个逐字 span 必须是完整的 emoji（一个码点），不是被切开的半个代理项。
		expect(container.querySelector(".weknora-stream-char")?.textContent).toBe("😀");
		// 可见层文本与源文本逐字节一致。
		expect(container.querySelector("p > span[aria-hidden='true']")?.textContent).toBe(text);
		// 不含孤立代理项（单个 UTF-16 代理码元）。
		const lone = /^[\uD800-\uDFFF]$/;
		for (const span of container.querySelectorAll(".weknora-stream-char")) {
			expect(lone.test(span.textContent ?? ""), `孤立代理项: ${span.textContent}`).toBe(false);
		}
	});
});
