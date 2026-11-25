// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { i18n, initI18n } from "@shared/i18n";
import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { WeKnoraPageActions, WeKnoraPageViewModel } from "../hooks/useWeKnoraViewModel";
import { WeKnoraPageView } from "./WeKnoraPageView";

// Markdown 渲染由共享管线负责（真实实现依赖 activity-panel 上下文）；这里替换成可断言的桩，
// 避免纯展示视图的布局测试被无关的渲染管线牵连。
vi.mock("@shared/components/RendererMarkdownContent", () => ({
	RendererMarkdownContent: ({ text }: { text: string }) => <div data-testid="weknora-markdown">{text}</div>,
}));

const noop = (): void => undefined;

/** 纯展示视图的最小可用 viewModel：业务状态全空、UI 铬件取默认。 */
function viewModel(overrides: Partial<WeKnoraPageViewModel> = {}): WeKnoraPageViewModel {
	return {
		agents: [],
		agentsStatus: "ready",
		baseUrl: "http://host:8083",
		batchDeleting: false,
		canAsk: false,
		configured: true,
		currentSessionId: null,
		deleteError: null,
		deletingSessionId: null,
		exporting: false,
		hasApiKey: true,
		isStreaming: false,
		loadingSessionId: null,
		messages: [],
		saveError: null,
		saving: false,
		selectedAgentId: null,
		sessions: [],
		sessionsStatus: "ready",
		settingsOpen: false,
		sidebarCollapsed: false,
		sidebarWidth: 272,
		streamingSessionIds: new Set<string>(),
		...overrides,
	};
}

/** 动作全为 no-op。 */
function actions(): WeKnoraPageActions {
	return {
		cancel: noop,
		deleteSession: async () => true,
		deleteSessions: async () => ({ succeeded: [], failed: [] }),
		exportSession: async () => undefined,
		exportSessions: async () => ({ succeeded: [], failed: [] }),
		newConversation: noop,
		openSession: async () => undefined,
		reloadAgents: noop,
		reloadSessions: noop,
		resizeSidebar: noop,
		saveSetup: async () => undefined,
		selectAgent: noop,
		send: noop,
		toggleSettings: noop,
		toggleSidebar: noop,
	};
}

function renderView(modelOverrides: Partial<WeKnoraPageViewModel> = {}): HTMLElement {
	const { container } = render(<WeKnoraPageView viewModel={viewModel(modelOverrides)} actions={actions()} />);
	return container;
}

beforeAll(() => {
	initI18n();
});

beforeEach(async () => {
	await i18n.changeLanguage("zh");
	localStorage.clear();
});

describe("WeKnoraPageView · 页头贴边与留白收紧（AC-1/1c/2，DESIGN.md:283 特例保留）", () => {
	it("页头下边距 8px（pb-2）、页面不再自带拖拽带；内容行左右 12px、下边距 12px", () => {
		const root = renderView().firstElementChild as HTMLElement;
		const header = root.querySelector("header") as HTMLElement;
		// 内容行 = 根节点唯一的直接子元素（页头在详情列内部，详见 weknora-visual-layout）。
		const contentRow = root.firstElementChild as HTMLElement;

		// 契约（weknora-top-whitespace-fix AC-1）：本页原先自带 `drag-region h-12`（48px 纯空白带），
		// 已删除——窗口拖拽由外壳页头承担，故本页不应再出现任何 `.drag-region` 节点。
		expect(root.querySelector(".drag-region")).toBeNull();

		// 页头下边距 16→8px。
		expect(header.classList.contains("pb-2")).toBe(true);
		expect(header.classList.contains("pb-4")).toBe(false);

		// 内容行左右 32→12px、下边距 32→12px（历史栏随之整体上移）。
		expect(contentRow.classList.contains("px-3")).toBe(true);
		expect(contentRow.classList.contains("pb-3")).toBe(true);
		expect(contentRow.classList.contains("pb-8")).toBe(false);
	});
});

describe("WeKnoraPageView · 副标题文案（AC-3/13）", () => {
	it("zh：副标题为「由小爱酱知识库为你回答」，标题不变", () => {
		renderView();
		expect(screen.getByText("由小爱酱知识库为你回答")).toBeTruthy();
		expect(screen.getByText("智能客服")).toBeTruthy();
	});

	it("en：副标题镜像改写，标题不变", async () => {
		await i18n.changeLanguage("en");
		renderView();
		expect(screen.getByText("Answered by Xiaoaijiang knowledge base")).toBeTruthy();
		expect(screen.getByText("Customer Service")).toBeTruthy();
	});
});
