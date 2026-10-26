// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import zhChat from "@/shared/i18n/locales/zh/chat.json";
import { formatSessionAxesBadge, resolveSessionAxes } from "@domains/workspace-mode/lib/session-axes";
import { sessionAxesBadgeKind } from "@domains/workspace-mode/lib/workspace-session-flow";
import { InputBarView } from "./InputBarView";
import type { InputBarModel } from "./types";

// 被测路径是 InputBarView 的条件渲染（sessionAxesLabel → 徽标槽位）与 InputBarFooter
// 的真实插槽行为；Lexical 编辑器、命令面板、抽屉等重型子树换成哑元，与本测试无关。
// theme-sdk 自带一份独立的 react 解析，组件测试里按仓库惯例只透传 fallback / 置空，
// 避免 hooks 落到另一份 React 实例上（同 NewSessionHeroIdentity.test 的做法）。
vi.mock("@vetta-org/theme-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@vetta-org/theme-sdk")>();
	return { ...actual, useThemeComponent: (_key: string, fallback: unknown) => fallback };
});
vi.mock("@vetta-org/theme-sdk/appearance", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@vetta-org/theme-sdk/appearance")>();
	return { ...actual, useThemeSurface: () => undefined };
});
vi.mock("@vetta-org/theme-ui/shared", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@vetta-org/theme-ui/shared")>();
	return { ...actual, useDelayedUnmount: (open: boolean) => open };
});
// theme-ui 自带另一份 React；本测试只证明徽标槽位，compound 输入壳改成透传。
vi.mock("@vetta-org/theme-ui/chat", () => {
	const Pass = ({ children }: { children?: unknown }) => <>{children}</>;
	return {
		MessageInput: Object.assign(Pass, {
			Root: Pass,
			Surface: Pass,
			DropZone: Pass,
			Content: Pass,
			Toolbar: Pass,
			ToolbarLeading: Pass,
			ToolbarTrailing: Pass,
		}),
		InputBarBackground: Pass,
		InputBarContextMenuView: () => null,
		InputBarPlaceholder: () => null,
	};
});
vi.mock("@vetta-org/theme-ui/bottom-panel", () => ({
	BottomPanelPillsView: () => null,
}));
vi.mock("./editor/InputEditor", () => ({ InputEditor: () => <div data-testid="input-editor-stub" /> }));
vi.mock("./InputBarAttachmentPreview", () => ({ InputBarAttachmentPreview: () => null }));
vi.mock("./InputBarDrawer", () => ({ InputBarDrawer: () => <nav data-testid="drawer-stub" /> }));
vi.mock("./InputBarToolbar", () => ({
	InputBarActiveActions: () => null,
	InputBarAttachmentActions: () => null,
	InputBarContextAction: () => null,
	InputBarExecutionModeAction: () => null,
	InputBarModelAction: () => null,
	InputBarSendAction: () => null,
	InputBarSkillsAction: () => null,
	InputBarSpeechAction: () => null,
	InputBarToolbarDivider: () => null,
}));
vi.mock("../AtPanel", () => ({ AtPanel: () => null }));
vi.mock("../ActionButtonBar", () => ({ ActionButtonBar: () => null }));
vi.mock("../command-panel/CommandPanel", () => ({ CommandPanel: () => null }));
vi.mock("../McpElicitationPanel", () => ({ McpElicitationPanel: () => null }));
vi.mock("../PlanReviewPanel", () => ({ PlanReviewPanel: () => null }));
vi.mock("../QuestionPanel", () => ({ QuestionPanel: () => null }));

// 取词只认 zh/chat.json；插值与 i18next 同构，断言文案即用户看见的 catalog。
const AXES_LABELS = zhChat.session.axes;

/** 与 DefaultInputBarConnector 的接线同构：唯一派生点 → i18n 取词 → formatSessionAxesBadge。 */
function connectorSessionAxesLabel(
	agentMode: string | undefined,
	capabilityProfile: string | undefined,
): string | null {
	const axes = resolveSessionAxes(agentMode, capabilityProfile);
	const interpretation = AXES_LABELS.interpretation[axes.agentMode];
	const profile = AXES_LABELS.profile[axes.capabilityProfile];
	const template =
		sessionAxesBadgeKind(axes) === "aligned"
			? AXES_LABELS.aligned[axes.agentMode]
			: AXES_LABELS.divergent.replaceAll("{{interpretation}}", interpretation).replaceAll("{{profile}}", profile);
	return formatSessionAxesBadge({
		agentMode,
		capabilityProfile,
		template,
	});
}

function createBaseModel(): InputBarModel {
	return {
		dropZone: {
			dragKind: null,
			enabled: false,
			labels: { releaseToRef: "释放以添加", internalRef: "内部拖拽", externalRef: "外部文件" },
			onDragEnter: vi.fn(),
			onDragOver: vi.fn(),
			onDragLeave: vi.fn(),
			onDrop: vi.fn(),
		},
		isStreaming: false,
		pendingQuestion: undefined,
		pendingMcpElicitation: undefined,
		imageAttachments: [],
		activeActions: [],
		appshotAttachment: null,
		hasSession: true,
		canSend: true,
		isEmpty: true,
		showPlaceholder: false,
		hasCapsules: false,
		effectiveCwd: "C:\\tmp\\project",
		placeholderTexts: ["给 Vetta 派活…"],
		placeholderRotating: false,
		isFocused: false,
		drawerItems: [],
		drawerActiveTab: null,
		todo: null,
		sessionAxesLabel: null,
		bottomPanelPills: null,
		speechInput: null,
		hasPromptAttachment: false,
		pendingMessageEdit: false,
		pendingEditHint: "正在替换上一条消息",
		cancelPendingEditLabel: "取消",
		contextMenu: null,
		editor: { namespace: "chat-input-test" },
		modelSelector: { updateActiveSession: true },
		leadingTools: [],
		trailingTools: [],
		sendBehavior: "direct",
		labels: {
			capsule: {
				removeDefault: "移除",
				removeImage: "移除图片",
				removeTooltip: (path) => path,
				activeGroup: (count) => `${count} 个插件`,
			},
			permission: { deny: "拒绝", allow: "允许", allowSession: "本会话允许" },
			toolbar: { skills: "技能", addImage: "添加图片", attachFile: "添加文件", queue: "队列" },
		},
		actions: {
			setFocused: vi.fn(),
			setDrawerActiveTab: vi.fn(),
			handleEnter: () => false,
			handleContextMenu: vi.fn(),
			removeImage: vi.fn(),
			openImagePreview: vi.fn(),
			removePromptAttachment: vi.fn(),
			removeAppshot: vi.fn(),
			handleSelectImages: async () => undefined,
			handleSelectFiles: async () => undefined,
			handleSend: vi.fn(),
			handleAbort: async () => undefined,
			cancelPendingEdit: vi.fn(),
		},
	};
}

afterEach(cleanup);

describe("InputBarView 会话轴徽标", () => {
	it("已固化轴的会话在输入卡片下沿展示只读徽标", () => {
		const label = connectorSessionAxesLabel("work", "work");
		expect(label).toBe("本会话按文档与研究开的 · 模式创建时已固定");
		render(<InputBarView model={{ ...createBaseModel(), sessionAxesLabel: label }} />);
		expect(screen.getByTestId("session-axes-badge").textContent).toBe("本会话按文档与研究开的 · 模式创建时已固定");
	});

	it("普通会话（无固化轴）不渲染徽标", () => {
		render(<InputBarView model={createBaseModel()} />);
		expect(screen.queryByTestId("session-axes-badge")).toBeNull();
	});

	it("(work, coding) 分歧会话两标签各自成立，不再混报为同一档", () => {
		const label = connectorSessionAxesLabel("work", "coding");
		expect(label).toBe("本会话：文档向 · 代码");
		render(<InputBarView model={{ ...createBaseModel(), sessionAxesLabel: label }} />);
		const badge = screen.getByTestId("session-axes-badge");
		expect(badge.textContent).toContain("文档向");
		expect(badge.textContent).toContain("代码");
		expect(badge.textContent).not.toMatch(/办公|编程|\{\{/);
	});

	it("未知第三值 agentMode 折叠口径与 main 一致：解释报 work、工具面如实报 coding", () => {
		// main 侧（resolve-session-config）对 profile 折叠为「非 work 即 coding」，
		// 手编第三值的旧会话徽标必须与其实际生效的工具面一致，而不是谎报 work。
		const label = connectorSessionAxesLabel("architect", undefined);
		expect(label).toBe("本会话：文档向 · 代码");
		render(<InputBarView model={{ ...createBaseModel(), sessionAxesLabel: label }} />);
		expect(screen.getByTestId("session-axes-badge").textContent).toBe(label);
	});
});
