// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import { i18n, initI18n } from "@shared/i18n";
import { render, screen, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { WeKnoraPageViewProps } from "./components/WeKnoraPageView";
import { WeKnoraPageView } from "./components/WeKnoraPageView";

/**
 * 页头贴边（A 组）的**结构**独立用例（③ 测试相位自建）。
 *
 * 实现者已断言内边距/下边距的 token 类（px-3 / pb-2 / pb-3 / h-12）；本文件补的是
 * **未被覆盖的角度**：AC-1 的「标题块仍居左、AgentSelector 与设置按钮仍居右、垂直排布不变」、
 * AC-1b 的「侧栏首个元素是『新建对话』、无前置留白」。
 */

vi.mock("@shared/components/RendererMarkdownContent", () => ({
	RendererMarkdownContent: ({ text }: { text: string }) => <div data-testid="weknora-markdown">{text}</div>,
}));

vi.mock("@shared/components/ui/select", () => ({
	Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectTrigger: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => (
		<div {...props}>{children}</div>
	),
	SelectValue: () => <span />,
	SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
		<div role="button" data-value={value}>
			{children}
		</div>
	),
}));

const noop = (): void => undefined;

function props(overrides: Partial<WeKnoraPageViewProps> = {}): WeKnoraPageViewProps {
	return {
		agents: [
			{ id: "A", name: "Agent A" },
			{ id: "B", name: "Agent B" },
		],
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

function renderRoot(): HTMLElement {
	return render(<WeKnoraPageView {...props()} />).container.firstElementChild as HTMLElement;
}

/** 内容行 = 页头与拖拽区之外的直接子元素。 */
function contentRow(root: HTMLElement): HTMLElement {
	const header = root.querySelector("header");
	return Array.from(root.children).find(
		(child) => child !== header && !child.classList.contains("drag-region"),
	) as HTMLElement;
}

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

beforeEach(() => {
	// 侧栏收起态落盘在 localStorage；清掉以免用例间串场。
	localStorage.clear();
});

describe("WeKnoraPageView · 页头结构与侧栏上移（AC-1 / AC-1b）", () => {
	it("AC-1：标题块居左、AgentSelector 与设置按钮居右，垂直排布（items-end justify-between）不变", () => {
		const root = renderRoot();
		const row = root.querySelector("header")?.firstElementChild as HTMLElement;
		expect(row.classList.contains("items-end")).toBe(true);
		expect(row.classList.contains("justify-between")).toBe(true);

		const [left, right] = Array.from(row.children) as HTMLElement[];
		// 左列：标题块（标题 + 副标题）。
		expect(within(left).getByText("智能客服")).toBeTruthy();
		expect(within(left).getByText("由小爱酱知识库为你回答")).toBeTruthy();
		expect(within(left).queryByLabelText("智能体")).toBeNull();
		// 右列：智能体选择器 + 设置按钮。
		expect(within(right).getByLabelText("智能体")).toBeTruthy();
		expect(within(right).getByRole("button", { name: "设置" })).toBeTruthy();
	});

	it("AC-1b：侧栏首个元素是「新建对话」按钮（无前置留白），内容行无顶部内边距", () => {
		const root = renderRoot();
		const nav = root.querySelector("nav") as HTMLElement;
		expect(nav.firstElementChild?.textContent).toContain("新建对话");

		// 栏顶与页头下缘的间距只由页头的下边距决定：内容行不得再自带顶部内边距。
		const row = contentRow(root);
		const hasTopPadding = Array.from(row.classList).some((token) => /^pt-/.test(token));
		expect(hasTopPadding).toBe(false);
	});
});
