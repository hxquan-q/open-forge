// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { i18n, initI18n } from "@shared/i18n";
import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { WeKnoraPageView, type WeKnoraPageViewProps } from "./WeKnoraPageView";

// Markdown 渲染由共享管线负责（真实实现依赖 activity-panel 上下文）；这里替换成可断言的桩，
// 避免纯展示视图的布局测试被无关的渲染管线牵连。
vi.mock("@shared/components/RendererMarkdownContent", () => ({
	RendererMarkdownContent: ({ text }: { text: string }) => <div data-testid="weknora-markdown">{text}</div>,
}));

const noop = (): void => undefined;

/** 纯展示视图的最小可用 props：业务状态全空、动作全为 no-op，只验证布局与文案。 */
function props(overrides: Partial<WeKnoraPageViewProps> = {}): WeKnoraPageViewProps {
	return {
		agents: [],
		agentsStatus: "ready",
		baseUrl: "http://host:8083",
		batchDeleting: false,
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
		streamingSessionIds: new Set<string>(),
		onCancel: noop,
		onDeleteSession: async () => true,
		onDeleteSessions: async () => ({ succeeded: [], failed: [] }),
		onExportSession: async () => undefined,
		onExportSessions: async () => ({ succeeded: [], failed: [] }),
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

function renderView(overrides: Partial<WeKnoraPageViewProps> = {}): HTMLElement {
	const { container } = render(<WeKnoraPageView {...props(overrides)} />);
	return container;
}

beforeAll(() => {
	initI18n();
});

beforeEach(async () => {
	await i18n.changeLanguage("zh");
});

describe("WeKnoraPageView · 页头贴边与留白收紧（AC-1/1b/1c/2）", () => {
	it("页头左右 12px、下边距 8px；内容行同宽、下边距 12px；页面不再自带拖拽带", () => {
		const root = renderView().firstElementChild as HTMLElement;
		const header = root.querySelector("header") as HTMLElement;
		// 根节点下除页头外的那个直接子元素即内容行（不靠下标，避免顺序脆弱）。
		const contentRow = Array.from(root.children).find((child) => child !== header) as HTMLElement;

		// 契约变更（weknora-top-whitespace-fix AC-1）：本页原先自带 `drag-region h-12`（48px 纯空白带），
		// 现已删除——窗口拖拽由外壳页头承担（`PageHeaderFrame` 自身即 `drag-region`，全站 content 路由都会
		// 渲染它），故本页不应再出现任何 `.drag-region` 节点。旧用例断言「拖拽区 h-12 保留」钉的是上一轮的
		// 错误假设（把这条纯空白带当成拖拽硬约束），经队长授权按新语义调整。
		expect(root.querySelector(".drag-region")).toBeNull();

		// 页头贴边：左右 32→12px、下边距 16→8px。
		expect(header.classList.contains("px-3")).toBe(true);
		expect(header.classList.contains("pb-2")).toBe(true);
		expect(header.classList.contains("px-8")).toBe(false);
		expect(header.classList.contains("pb-4")).toBe(false);

		// 内容行与页头左右对齐，下边距 32→12px（历史栏随之整体上移）。
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
