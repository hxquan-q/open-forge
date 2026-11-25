// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { i18n, initI18n } from "@shared/i18n";
import { render } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { WeKnoraPageView } from "./components/WeKnoraPageView";
import type { WeKnoraPageActions, WeKnoraPageViewModel } from "./hooks/useWeKnoraViewModel";

/**
 * 「删除智能客服页顶部 48px 空白带」(weknora-top-whitespace-fix AC-1) 的**独立**结构用例
 * (③ 测试相位自建，不复用实现者 `WeKnoraPageView.test.tsx` 的断言)。
 *
 * 角度:实现者只断言了 `root.querySelector(".drag-region")` 为 null。本文件补的是**结构顺序**角度——
 * 「空白带没了」不仅意味着没有 `.drag-region` 节点，还意味着根节点第一个直接子元素之前不存在
 * 任何占位兄弟（此前它前面正好是那条 48px 空白带），且没有用 `h-12`(48px)的直接子元素把等效
 * 空白带又加回来。
 *
 * TASK-0506 结构调整说明：页头 `header` 已从根的直接子元素移进内容行的详情列内部（分屏布局的
 * 右侧列），因此「header 是根的第一个直接子元素」改述为等价事实——根的第一个直接子元素是内容行
 * `div`（而非 `header`/空白带），页头是详情列的第一个子元素。
 *
 * jsdom 证不了真实像素高度与拖拽手感，见 05-tests.md 的残余风险区。
 */

vi.mock("@shared/components/RendererMarkdownContent", () => ({
	RendererMarkdownContent: ({ text }: { text: string }) => <div data-testid="weknora-markdown">{text}</div>,
}));

const noop = (): void => undefined;

/** 纯展示视图的最小可用 viewModel：业务状态全空，只验证页面结构。 */
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

/** 页面根节点(实现里是 `WeKnoraPageView` 最外层 div)。 */
function renderRoot(overrides: Partial<WeKnoraPageViewModel> = {}): HTMLElement {
	return render(<WeKnoraPageView viewModel={viewModel(overrides)} actions={actions()} />).container
		.firstElementChild as HTMLElement;
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
		// TASK-0506：页头移进内容行的详情列内部。等价事实——根的第一个直接子元素是
		// 内容行 `div`（其前不存在任何兄弟节点，旧的空白带正是这个位置），
		// 页头是详情列（内容行末列）的第一个子元素。
		const contentRow = root.firstElementChild as HTMLElement;
		expect(contentRow.tagName).toBe("DIV");
		expect(contentRow.previousElementSibling).toBeNull();
		const detailColumn = contentRow.lastElementChild as HTMLElement;
		expect(detailColumn.firstElementChild).toBe(header);
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
