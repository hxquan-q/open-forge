// Modified by The Open Forge contributors.
// @vitest-environment jsdom

import type {
	DesktopTeamSessionSnapshot,
	DesktopTeamSessionStreamEvent,
} from "@preload/api-types/team-conversation-display";
import type { ChatConversationItem } from "@shared/store/atoms";
import { createAssistantMessage } from "@vetta/ai";
import { createAgentTeamFixture, type TeamSessionDocument } from "@vetta/agent-team";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { usePageHeaderModel } from "@shared/app-shell/page-header";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamChatPage } from "./TeamChatPage";
import {
	loadTeamChatBootstrap,
	loadTeamChatSession,
} from "./team-chat-session-service";

import { focusInputEditor, getInputEditor, insertPlainText } from "../../components/input-bar/editor/inputEditorHandle";
import type { TeamChatActions } from "./teamChatModel";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		i18n: { language: "zh", resolvedLanguage: "zh" },
		t: (key: string, values?: Record<string, unknown>) => {
			let template: string = key;
			for (const [name, value] of Object.entries(values ?? {})) {
				template = template.replace(`{{${name}}}`, String(value));
			}
			return template;
		},
	}),
}));

vi.mock("@shared/hooks/useRendererMarkdownModel", () => ({
	useRendererMarkdownModel: () => ({
		theme: "light",
		labels: { copy: "Copy", copied: "Copied" },
		getFileIconClass: () => "icon",
		onOpenFile: vi.fn(),
		onOpenUrl: vi.fn(),
	}),
}));

vi.mock("@shared/lib/committed-paint", () => ({
	waitForCommittedPaint: vi.fn(async () => "painted"),
}));

vi.mock("./team-chat-session-service", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	loadTeamChatSession: vi.fn(),
	loadTeamChatBootstrap: vi.fn(),
	createTeamChatSession: vi.fn(),
	createReservedTeamChatSession: vi.fn(),
}));


// 本用例验证「失败终态到达后整棵渲染树稳定」：composer（TeamComposerConnector →
// InputBar → InputEditor/Lexical）、聊天壳（DefaultChatView + ActivityPanel）、
// 时间线（MessageList）、路由与页头接线全部走真实实现；只有外部 IPC 边界 Mock。
vi.mock("../../components/message-list/UserMessage", () => ({
	UserMessage: ({ message }: { message: Extract<ChatConversationItem, { kind: "user" }> }) => (
		<div data-testid="user-message">{message.text}</div>
	),
}));

vi.mock("@domains/plugins/runtime/plugin-host-bridge", () => ({
	publishPluginTurnStart: vi.fn(),
}));

const teamDocument = createAgentTeamFixture();
const team = teamDocument.teams[0];
if (!team) throw new Error("built-in Agent Team fixture is missing");
const leaderMember = team.members.find((member) => member.id === team.leaderMemberId);
if (!leaderMember) throw new Error("Dev Team fixture leader is missing");
const leader = leaderMember;

const architect = team.members.find((member) => member.handle === "developer");
if (!architect) throw new Error("Dev Team fixture developer is missing");

const session: TeamSessionDocument = {
	schemaVersion: 1,
	revision: 0,
	id: "team-session",
	teamId: team.id,
	name: team.name,
	cwd: "C:/workspace",
	orchestrationPolicyId: team.orchestrationPolicyId,
	contextPolicyId: team.contextPolicyId,
	leaderMemberId: leader.id,
	memberHandles: Object.fromEntries(team.members.map((member) => [member.id, member.handle])),
	createdAt: 1,
	updatedAt: 1,
	events: [],
	coordinationRuntime: { sessionId: "coordination-runtime", sessionPath: "C:/sessions/coordination.jsonl" },
	memberRuntime: {
		[leader.id]: { sessionId: "leader-runtime", sessionPath: "C:/sessions/leader.jsonl", agentProfileRevision: 1, deliveredEventIds: [] },
		[architect.id]: { sessionId: "architect-runtime", sessionPath: "C:/sessions/architect.jsonl", agentProfileRevision: 1, deliveredEventIds: [] },
	},
};

/** 与生产同构的运行中快照：成员 runtime、working 指示、上下文占用、进行中的委派。 */
const runningSnapshot: DesktopTeamSessionSnapshot = {
	session: { ...session, revision: 1 },
	conversationRevision: 1,
	messages: [
		{
			kind: "user",
			id: "persisted-user",
			turnId: "request",
			author: { kind: "user", id: "local-user" },
			message: { role: "user", content: "处理团队任务", timestamp: 1 },
			timestamp: 1,
		},
	],
	activities: [
		{
			kind: "delegation",
			id: "delegate-architect",
			requestId: "architect-turn",
			sourceMemberId: leader.id,
			targetMemberId: architect.id,
			objective: "设计实现方案",
			state: "running",
			timestamp: 1,
		},
	],
	display: {
		executionMode: "full-access",
		contextUsages: [
			{
				memberId: leader.id,
				runtimeSessionId: "leader-runtime",
				percent: 42,
				contextWindow: 200000,
				contextTokens: 84000,
			},
			{
				memberId: architect.id,
				runtimeSessionId: "architect-runtime",
				percent: 17,
				contextWindow: 200000,
				contextTokens: 34000,
			},
		],
		memberConversations: [
			{
				memberId: leader.id,
				runtimeSessionId: "leader-runtime",
				history: [],
			},
			{
				memberId: architect.id,
				runtimeSessionId: "architect-runtime",
				history: [],
			},
		],
	},
};

const captured = {
	actions: undefined as TeamChatActions | undefined,
};

/** 生产页头读侧：消费 title/right slot atoms 的宿主（对应 RootLayout 的 PageHeader）。 */
function RouteShell(): JSX.Element {
	const header = usePageHeaderModel({ narrow: false, sidebarCollapsed: false });
	return (
		<div>
			<div data-testid="page-header">
				{header.title}
				{header.rightSlot}
			</div>
			<Outlet />
		</div>
	);
}

const rootRoute = createRootRoute({ component: RouteShell });
const teamSessionRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/agent-teams/$teamId/sessions/$sessionId",
	component: TeamChatPage,
});
const routeTree = rootRoute.addChildren([teamSessionRoute]);

function buildRouter() {
	return createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: [`/agent-teams/${team.id}/sessions/${session.id}`] }),
	});
}

let router: ReturnType<typeof buildRouter>;

// jsdom 缺失项：Lexical 选区滚动会读 document/range 的 getBoundingClientRect，路由滚动恢复调 scrollTo。
const zeroRect = () =>
	({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
const documentPrototype = Document.prototype as unknown as Record<string, unknown>;
if (typeof documentPrototype.getBoundingClientRect !== "function") {
	documentPrototype.getBoundingClientRect = zeroRect;
}
if (typeof Range.prototype.getBoundingClientRect !== "function") {
	Range.prototype.getBoundingClientRect = zeroRect;
}
window.scrollTo = () => undefined;
if (typeof globalThis.ResizeObserver !== "function") {
	globalThis.ResizeObserver = class ResizeObserver {
		private readonly callback: ResizeObserverCallback;
		constructor(callback: ResizeObserverCallback) {
			this.callback = callback;
		}
		observe(target: Element): void {
			queueMicrotask(() => {
				const rect = { top: 0, left: 0, bottom: 800, right: 600, width: 600, height: 800, x: 0, y: 0 };
				this.callback(
					[{ target, contentRect: rect as DOMRectReadOnly, borderBoxSize: [], contentBoxSize: [] }] as unknown as ResizeObserverEntry[],
					this,
				);
			});
		}
		unobserve(): void {}
		disconnect(): void {}
	};
}
// Virtuoso 依赖真实布局决定渲染窗口；jsdom 全部为 0，给出非零视口让时间线真实渲染。
Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 800 });
Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 600 });
Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, value: 64 });
Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });

function Harness(): JSX.Element {
	return (
		<StrictMode>
			<Provider store={createStore()}>
				<RouterProvider router={router} />
			</Provider>
		</StrictMode>
	);
}

function textDeltaEvent(turnId: string, delta: string): DesktopTeamSessionStreamEvent {
	const partial = {
		...createAssistantMessage(
			{ api: "agent-team-test", provider: "agent-team-test", model: "fixture" },
			{ timestamp: 1 },
		),
		content: [{ type: "text" as const, text: delta }],
	};
	return {
		type: "conversation.agent-message-event",
		conversationId: session.id,
		messageId: "leader-live",
		turnId,
		author: { kind: "agent", id: leader.id },
		sequence: 1,
		timestamp: 1,
		event: { type: "text_delta", contentIndex: 0, delta, partial },
	};
}

describe("Team failure terminal state rendering stability", () => {
	let streamListener: ((event: DesktopTeamSessionStreamEvent) => void) | undefined;

	beforeEach(() => {
		vi.clearAllMocks();
		streamListener = undefined;
		captured.actions = undefined;
		vi.mocked(loadTeamChatSession).mockResolvedValue({
			document: teamDocument,
			snapshot: runningSnapshot,
			sessions: [],
		});
		vi.mocked(loadTeamChatBootstrap).mockResolvedValue({ document: teamDocument, sessions: [] });
		Object.defineProperty(window, "vetta", {
			configurable: true,
			value: {
				agentTeams: {
					subscribe: vi.fn(
						async (_sessionId: string, listener: (event: DesktopTeamSessionStreamEvent) => void) => {
							streamListener = listener;
							return () => undefined;
						},
					),
					// BUG-0101：send IPC 悬挂不返回（死连接下 send-message 长驻），回合终态只由流事件驱动。
					sendMessage: vi.fn(async () => new Promise<DesktopTeamSessionSnapshot>(() => undefined)),
					updateModelSettings: vi.fn(async () => runningSnapshot),
					setExecutionMode: vi.fn(async () => runningSnapshot),
					abort: vi.fn(),
				},
				dialog: {
					selectFiles: vi.fn(async () => []),
					selectImages: vi.fn(async () => []),
				},
				skills: { list: vi.fn(async () => []) },
				abilities: { listOpenMarketplaces: vi.fn(async () => ({ abilities: [] })) },
				session: { getAgentModes: vi.fn(async () => []) },
				speechInput: { onEvent: vi.fn(() => () => undefined) },
				config: { get: vi.fn(async () => ({})) },
				models: { get: vi.fn(async () => ({})) },
				mcp: { get: vi.fn(async () => ({ mcpServers: {} })) },
				terminal: { capabilities: vi.fn(async () => ({ localPty: false })) },
			},
		});
	});

	it("keeps the page stable when a hung send reaches the failed terminal state", async () => {
		router = buildRouter();
		render(<Harness />);
		await waitFor(() => expect(streamListener).toBeTypeOf("function"));
		const input = await waitFor(() => {
			const editor =
				document.querySelector('[data-lexical-editor="true"]') ?? document.querySelector('[role="textbox"]');
			if (!editor) throw new Error("editor not mounted yet");
			return editor;
		});

		await act(async () => {
			focusInputEditor();
			insertPlainText("处理团队任务");
		});
		await waitFor(() => expect(getInputEditor()).not.toBeNull());
		const sendButton = await screen.findByTitle("sendButton.sendMessage");
		expect((sendButton as HTMLButtonElement).disabled).toBe(false);

		await act(async () => {
			fireEvent.click(sendButton);
		});
		await waitFor(() => expect(window.vetta.agentTeams.sendMessage).toHaveBeenCalledTimes(1));
		const requestId = vi.mocked(window.vetta.agentTeams.sendMessage).mock.calls[0]?.[1].requestId;
		if (!requestId) throw new Error("send request id is missing");

		act(() => {
			streamListener?.(textDeltaEvent(requestId, "规划中"));
		});

		// 生产终态是事件突发，不是单条 discard：快照持久化（标题首次落定）、
		// 上下文占用回灌、discard、快照重建按到达顺序回灌渲染进程。
		act(() => {
			streamListener?.({
				type: "session-updated",
				teamSessionId: session.id,
				snapshot: {
					...runningSnapshot,
					session: { ...session, revision: 2, name: "处理团队任务" },
					conversationRevision: 2,
					messages: [
						...runningSnapshot.messages,
						{
							kind: "agent" as const,
							id: "leader-public-step",
							turnId: requestId,
							author: { kind: "agent" as const, id: leader.id },
							message: {
								...createAssistantMessage(
									{ api: "agent-team-test", provider: "agent-team-test", model: "fixture" },
									{ timestamp: 2 },
								),
								stopReason: "error",
							},
							timestamp: 2,
						},
					],
				},
			});
			streamListener?.(textDeltaEvent(requestId, "规划"));
			streamListener?.({
				type: "desktop.team-context-usage",
				conversationId: "leader-runtime",
				memberId: leader.id,
				runtimeSessionId: "leader-runtime",
				contextUsage: { memberId: leader.id, runtimeSessionId: "leader-runtime", percent: 55, contextWindow: 200000 },
				isCompacting: false,
			});
			streamListener?.({
				type: "conversation.agent-message-discard",
				conversationId: session.id,
				messageId: "leader-live",
				turnId: requestId,
				author: { kind: "agent", id: leader.id },
				sequence: 2,
				reason: "failed",
				error: "stream idle timeout",
				timestamp: 4,
			});
			streamListener?.({
				type: "session-snapshot",
				teamSessionId: session.id,
				activeMessageEvents: [],
				snapshot: {
					...runningSnapshot,
					session: { ...session, revision: 3, name: "处理团队任务" },
					conversationRevision: 3,
				},
			});
		});

		// 再等两轮微任务/被动效应，任何「每次渲染都调度同步更新」的循环都会在此暴露为
		// Maximum update depth exceeded。
		await act(async () => {
			await new Promise((resolve) => window.setTimeout(resolve, 50));
		});

		// 用户可见结果：整页未被路由错误页替换（崩溃会以未捕获错误冒泡使本用例失败）、
		// 成员胶囊条仍在、输入区未被卸载。错误卡片呈现由 TeamChatDelegationFlow 的轻量
		// 时间线覆盖；本用例的价值在真实路由/composer/聊天壳/成员胶囊条接线在终态突发
		// 下不进入渲染循环。
		expect(document.querySelector('[data-team-member-roster="true"]')).toBeTruthy();
		expect(document.querySelector('div[contenteditable="true"]')).toBe(input);
	});
});
