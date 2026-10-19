// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { i18n, initI18n } from "@shared/i18n";
import { installLiveAnimations, LIVE_ANIMATION_SELECTORS } from "@shared/lib/live-animations";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { WeKnoraChatMessage } from "../atoms";
import { MessageBubble } from "./MessageBubble";
import { ThinkingDots } from "./ThinkingDots";

// 回答区 Markdown 由共享管线渲染（依赖 activity-panel 上下文）；这里替换成可断言的桩。
vi.mock("@shared/components/RendererMarkdownContent", () => ({
	RendererMarkdownContent: ({ text }: { text: string }) => <div data-testid="weknora-markdown">{text}</div>,
}));

const THINKING_DOT_CLASSES = [".weknora-thinking-dot-1", ".weknora-thinking-dot-2", ".weknora-thinking-dot-3"] as const;
const DOTS_SELECTOR = THINKING_DOT_CLASSES.join(", ");

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

afterEach(() => {
	vi.unstubAllGlobals();
	// jsdom 没有 Web Animations；本文件在个别用例里临时补桩，用完清掉。
	Reflect.deleteProperty(Element.prototype, "animate");
});

function assistant(overrides: Partial<WeKnoraChatMessage>): WeKnoraChatMessage {
	return { id: "a1", role: "assistant", text: "", thinking: "", status: "complete", ...overrides };
}

/** 补一个 WAAPI 桩，记录宿主动画模块给哪些元素建了动画（只关心「建了没有」）。 */
interface FakeAnimation {
	startTime: number | null;
	cancel: () => void;
}

function stubAnimate(): Array<{ element: Element; animation: FakeAnimation }> {
	const created: Array<{ element: Element; animation: FakeAnimation }> = [];
	Object.defineProperty(Element.prototype, "animate", {
		configurable: true,
		value(this: Element, _keyframes: Keyframe[], _options: KeyframeAnimationOptions) {
			const animation: FakeAnimation = { startTime: null, cancel: vi.fn() };
			created.push({ element: this, animation });
			return animation;
		},
	});
	return created;
}

/** MutationObserver 回调走微任务；等一轮让它跑完。 */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("ThinkingDots · 组件（AC-7 / AC-9 / AC-13）", () => {
	it("渲染三个装饰点（整体对辅助技术隐藏）+ i18n「思考中」文案", () => {
		const { container } = render(<ThinkingDots />);

		expect(container.querySelectorAll(DOTS_SELECTOR)).toHaveLength(3);
		// 三点是纯装饰：包在一个 aria-hidden 容器里，语义由文案承担。
		const decorative = container.querySelector("span[aria-hidden='true']");
		expect(decorative).not.toBeNull();
		expect(decorative?.querySelectorAll(DOTS_SELECTOR)).toHaveLength(3);
		expect(screen.getByText(i18n.t("weknora:message.thinkingPending"))).toBeTruthy();
	});

	it("三点类名登记在宿主动画表里（动画由 live-animations 统一挂，组件不自写无限关键帧）", () => {
		for (const className of THINKING_DOT_CLASSES) {
			expect(LIVE_ANIMATION_SELECTORS).toContain(className);
		}
	});

	it("宿主给三个点各挂一条错峰动画（三点相位互不相同）", async () => {
		const created = stubAnimate();
		vi.stubGlobal("matchMedia", () => ({ matches: false }));

		render(<ThinkingDots />);
		const uninstall = installLiveAnimations();
		await flush();

		expect(created).toHaveLength(3);
		// 「依次」= 三点相位互不相同（具体步长属观感，不硬断言）。
		expect(new Set(created.map((entry) => entry.animation.startTime)).size).toBe(3);
		uninstall();
	});

	it("reduced-motion：三点不动（宿主不挂动画），静态「思考中」文案仍在（AC-9）", async () => {
		const created = stubAnimate();
		vi.stubGlobal("matchMedia", () => ({ matches: true }));

		render(<ThinkingDots />);
		const uninstall = installLiveAnimations();
		await flush();

		expect(created).toHaveLength(0);
		expect(screen.getByText(i18n.t("weknora:message.thinkingPending"))).toBeTruthy();
		uninstall();
	});

	it("zh / en 齐平：新增文案键两种语言都有值（AC-13）", () => {
		expect(i18n.t("weknora:message.thinkingPending", { lng: "zh" })).toBe("思考中");
		expect(i18n.t("weknora:message.thinkingPending", { lng: "en" })).toBe("Thinking");
	});
});

describe("MessageBubble · 思考三点出现条件（AC-7 / AC-8）", () => {
	it("等待首字（流式、文本为空）出现三点 + 文案；首个字符到达后消失、改走思考块（互斥）", () => {
		const { container, rerender } = render(<MessageBubble message={assistant({ status: "streaming", text: "" })} />);
		expect(container.querySelectorAll(DOTS_SELECTOR)).toHaveLength(3);
		expect(screen.getByText("思考中")).toBeTruthy();

		rerender(<MessageBubble message={assistant({ status: "streaming", text: "首" })} />);
		// 首字到达：三点消失，旁白（思考过程）接管，不重复。
		expect(container.querySelectorAll(DOTS_SELECTOR)).toHaveLength(0);
		expect(screen.queryByText("思考中")).toBeNull();
		expect(screen.getByText("思考过程")).toBeTruthy();
	});

	it("终态不残留：complete / cancelled / interrupted / failed 均无三点", () => {
		for (const status of ["complete", "cancelled", "interrupted", "failed"] as const) {
			const { container, unmount } = render(<MessageBubble message={assistant({ status, text: "" })} />);
			expect(container.querySelectorAll(DOTS_SELECTOR)).toHaveLength(0);
			unmount();
		}
	});

	it("无请求进行时不出现：历史载入的完成消息不显示三点", () => {
		const { container } = render(
			<MessageBubble message={assistant({ status: "complete", thinking: "历史思考", text: "历史回答" })} />,
		);
		expect(container.querySelectorAll(DOTS_SELECTOR)).toHaveLength(0);
	});

	it("用户消息不出现三点", () => {
		const { container } = render(
			<MessageBubble message={{ id: "u1", role: "user", text: "", thinking: "", status: "streaming" }} />,
		);
		expect(container.querySelectorAll(DOTS_SELECTOR)).toHaveLength(0);
	});
});
