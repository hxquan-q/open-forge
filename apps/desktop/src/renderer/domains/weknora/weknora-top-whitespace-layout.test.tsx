// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { i18n, initI18n } from "@shared/i18n";
import { render } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { WeKnoraPageView, type WeKnoraPageViewProps } from "./components/WeKnoraPageView";

/**
 * 「删除智能客服页顶部 48px 空白带」(weknora-top-whitespace-fix AC-1) 的**独立**结构用例
 * (③ 测试相位自建，不复用实现者 `WeKnoraPageView.test.tsx` 的断言)。
 *
 * 角度:实现者只断言了 `root.querySelector(".drag-region")` 为 null。本文件补的是**结构顺序**角度——
 * 「空白带没了」不仅意味着没有 `.drag-region` 节点，还意味着页头 `header` 必须是根节点的**第一个直接
 * 子元素**(此前它前面正好是那条 48px 空白带)，且没有用 `h-12`(48px)的直接子元素把等效空白带又加回来。
 *
 * jsdom 证不了真实像素高度与拖拽手感，见 05-tests.md 的残余风险区。
 */

vi.mock("@shared/components/RendererMarkdownContent", () => ({
	RendererMarkdownContent: ({ text }: { text: string }) => <div data-testid="weknora-markdown">{text}</div>,
}));

const noop = (): void => undefined;

/** 纯展示视图的最小可用 props：业务状态全空、动作全为 no-op，只验证页面结构。 */
function props(overrides: Partial<WeKnoraPageViewProps> = {}): WeKnoraPageViewProps {
	return {
		agents: [],
		agentsStatus: "ready",
		baseUrl: "http://host:8083",
		configured: true,
		currentSessionId: null,
		deleteError: null,
		deletingSessionId: null,
		hasApiKey: true,
		isStreaming: false,
		loadingSessionId: null,
		messages: [],
		saveError: null,
		saving: false,
		selectedAgentId: null,
		sessions: [],
		sessionsStatus: "ready",
		streamingSessionIds: new Set<string>(),
		onCancel: noop,
		onDeleteSession: async () => true,
		onNewConversation: noop,
		onOpenSession: noop,
		onReloadAgents: noop,
		onReloadSessions: noop,
		onSaveSetup: noop,
		onSelectAgent: noop,
		onSend: noop,
		...overrides,
	};
}

/** 页面根节点(实现里是 `WeKnoraPageView` 最外层 div)。 */
function renderRoot(overrides: Partial<WeKnoraPageViewProps> = {}): HTMLElement {
	return render(<WeKnoraPageView {...props(overrides)} />).container.firstElementChild as HTMLElement;
}

beforeAll(() => {
	initI18n();
});

beforeEach(async () => {
	await i18n.changeLanguage("zh");
	localStorage.clear();
});

describe("WeKnoraPageView · 顶部 48px 空白带删除（AC-1）", () => {
	it("AC-1：页面根节点内不再存在任何 `.drag-region` 节点", () => {
		const root = renderRoot();
		expect(root.querySelector(".drag-region")).toBeNull();
	});

	it("AC-1：页头 `header` 是根节点的第一个直接子元素（其前不再有 48px 空白带）", () => {
		const root = renderRoot();
		const header = root.querySelector("header");
		expect(header).toBeTruthy();
		expect(root.firstElementChild).toBe(header);
		expect(root.firstElementChild?.tagName).toBe("HEADER");
		// 页头之前不存在任何兄弟节点——旧的空白带正是 header 的前一个兄弟。
		expect(header?.previousElementSibling).toBeNull();
	});

	it("AC-1：根节点的直接子元素里没有 `h-12`（48px）——等效空白带不得以任何名字加回来", () => {
		const root = renderRoot();
		const directChildren = Array.from(root.children);
		expect(directChildren.length).toBeGreaterThan(0);
		for (const child of directChildren) {
			expect(child.classList.contains("h-12"), `直接子元素 ${child.tagName} 带回了 48px 高度`).toBe(false);
		}
	});
});
