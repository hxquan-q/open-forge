// @vitest-environment jsdom
// Copyright The Open Forge contributors.
/**
 * 「会话异常中断后转圈无输出」判别套件。
 *
 * 用户报障：会话异常中断（turn 悬挂，事件流彻底安静）后仍可继续发送消息，
 * 界面持续转圈但永远等不到输出。本套件从真实入口（发送 → 悬挂 → 终态/回执）
 * 逐层判别：
 *
 * 1. 逃生舱：悬挂中按停止，kernel 宽限到期（SESSION_CANCEL_DEADLINE_EXCEEDED
 *    + 合成 agent_end + running=false）后界面必须收敛、同会话可续发。
 * 2. provider 停滞预算耗尽的终态到达后，界面必须收敛、可续发（证伪「停滞
 *    恢复链末端仍卡死」）。
 * 3. 单条终态事件丢失（preload 容错跳过 / IPC 半丢）时，prompt 的 completed
 *    回执是渲染端唯一可知的终态事实——不得永远转圈（当前为红测）。
 *
 * 监视器/分类器层的「流式悬挂失明」红测见：
 * - apps/desktop/src/main/agent-runtime/session-interrupt-monitor.test.ts
 * - packages/coding-agent/test/execution/session-interrupt-health.test.ts
 */

import type { OpenSessionOptions, SessionExecutionMode } from "@shared/store/atoms";
import { getDefaultStore } from "jotai";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	applyLocalRename: vi.fn(),
	ensureLocalSession: vi.fn(),
	loadSessions: vi.fn(async () => undefined),
	navigate: vi.fn(async () => undefined),
	prompt: vi.fn(async (): Promise<unknown> => ({ status: "completed" })),
}));

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mocks.navigate,
}));

vi.mock("@domains/project/hooks/useProjects", () => ({
	useProjectActions: () => ({
		applyLocalRename: mocks.applyLocalRename,
		ensureLocalSession: mocks.ensureLocalSession,
		loadSessions: mocks.loadSessions,
	}),
}));

vi.mock("@domains/plugins/runtime/plugin-events", () => ({
	waitForPluginHostReady: async () => undefined,
	waitForPluginHostFirstReady: async () => undefined,
}));

vi.mock("@domains/plugins/runtime/plugin-host-bridge", () => ({
	pluginSendMessageRef: { current: null },
}));

vi.mock("@shared/i18n", () => ({
	i18n: { t: (key: string) => key },
}));

vi.mock("@shared/lib/app-monitor-events", () => ({
	BUILTIN_KNOWLEDGE_RETRIEVAL_ACTION_ID: "builtin:knowledge-retrieval",
	recordInputActionsUsed: vi.fn(),
	recordInputContextUsed: vi.fn(),
}));

vi.mock("../services/context-composition-cache", () => ({
	resolveSessionContextComposition: () => undefined,
	writeCachedContextComposition: vi.fn(),
}));

interface SessionManagerProbe {
	sendMessage(
		overrideText?: string,
		options?: { stagedInput?: import("@shared/store/atoms").StagedSendInput },
	): Promise<{ status: "sent" | "queued" | "failed"; error?: { message: string }; queueItemId?: string } | undefined>;
	openSession(
		cwd: string,
		sessionPath?: string,
		executionMode?: SessionExecutionMode,
		options?: OpenSessionOptions,
	): Promise<void>;
	abortMessage(): Promise<void>;
}

type SessionEventHandler = (event: unknown) => void;

function installStorage(): void {
	const values = new Map<string, string>();
	vi.stubGlobal("localStorage", {
		clear: () => values.clear(),
		getItem: (key: string) => values.get(key) ?? null,
		removeItem: (key: string) => void values.delete(key),
		setItem: (key: string, value: string) => void values.set(key, value),
	});
}

const cwd = "/workspace";
const sessionPath = "/sessions/first.conversation.jsonl";
const runtimeId = "runtime-wedged-stream";

const runningChangeHandlers: Array<
	(payload: {
		sessionPath: string;
		running: boolean;
		sessionId?: string;
		reason?: "agent_end" | "aborted" | "error";
	}) => void
> = [];

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let manager: SessionManagerProbe | null = null;

beforeEach(() => {
	installStorage();
	vi.resetModules();
	vi.clearAllMocks();
	runningChangeHandlers.length = 0;
	mocks.prompt.mockImplementation(async () => ({ status: "completed" }));
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	container = document.createElement("div");
	document.body.append(container);
	Object.defineProperty(window, "vetta", {
		configurable: true,
		value: {
			batchTasks: { resumeTaskWithText: vi.fn() },
			config: { get: vi.fn(async () => ({})) },
			dialog: { persistImages: vi.fn(async () => []) },
			session: {
				abort: vi.fn(async () => undefined),
				autoTitle: vi.fn(),
				create: vi.fn(async () => ({ cwd, sessionId: runtimeId, sessionPath })),
				getFullHistory: vi.fn(async () => []),
				getQueueState: vi.fn(async () => ({ paused: false, entries: [] })),
				getSessionPath: vi.fn(async () => sessionPath),
				getState: vi.fn(async () => ({
					activeToolNames: [],
					contextPercent: null,
					contextWindow: 128_000,
					executionMode: "full-access",
					isStreaming: false,
					messageCount: 0,
					model: null,
					scenario: "project",
				})),
				listRunning: vi.fn(async () => [] as string[]),
				onRunningChanged: vi.fn(
					(
						handler: (payload: {
							sessionPath: string;
							running: boolean;
							sessionId?: string;
							reason?: "agent_end" | "aborted" | "error";
						}) => void,
					) => {
						runningChangeHandlers.push(handler);
						return vi.fn();
					},
				),
				openViewer: vi.fn(async () => ({ history: [] })),
				prompt: mocks.prompt,
				replaceLastUserMessage: vi.fn(async () => ({ leafId: null })),
				subscribe: vi.fn(async () => vi.fn()),
			},
		},
	});
});

afterEach(async () => {
	await act(async () => {
		await Promise.resolve();
		root?.unmount();
	});
	container?.remove();
	root = null;
	container = null;
	manager = null;
	vi.unstubAllGlobals();
});

async function mount(): Promise<ReturnType<typeof getDefaultStore>> {
	const { activeSessionAtom, chatMessagesAtom } = await import("@shared/store/atoms");
	const { useRunningSessionsSync } = await import("@shared/hooks/useRunningSessionsSync");
	const { useSessionManager } = await import("./useSessionManager");
	const store = getDefaultStore();
	store.set(activeSessionAtom, { cwd, runtimeId, sessionPath });
	store.set(chatMessagesAtom, []);

	function Probe() {
		manager = useSessionManager();
		useRunningSessionsSync();
		return null;
	}
	await act(async () => {
		root = createRoot(container as HTMLDivElement);
		root.render(createElement(Probe));
	});
	return store;
}

/** 打开既有会话建立真实订阅，返回事件与 running-changed 的显式同步点。 */
async function openWithSubscription(): Promise<{
	emit: (event: Record<string, unknown>) => void;
	notifyRunning: (running: boolean, reason?: "agent_end" | "aborted" | "error") => void;
}> {
	let eventHandler: SessionEventHandler | undefined;
	const sessionApi = (window as unknown as { vetta: { session: Record<string, unknown> } }).vetta.session;
	sessionApi.subscribe = vi.fn(async (_sessionId: string, handler: SessionEventHandler) => {
		eventHandler = handler;
		return vi.fn();
	});
	await act(async () => {
		await manager?.openSession(cwd, sessionPath);
	});
	if (!eventHandler) throw new Error("subscribe handler not captured");
	if (runningChangeHandlers.length === 0) throw new Error("onRunningChanged handler not captured");
	let tick = 1_000_000;
	const emit = (event: Record<string, unknown>): void => {
		tick += 50;
		const base = {
			schemaVersion: 1,
			sessionId: runtimeId,
			eventId: `e-${tick}`,
			timestamp: tick,
			source: "runtime-core",
		};
		act(() => eventHandler?.({ ...base, ...event }));
	};
	const notifyRunning = (running: boolean, reason?: "agent_end" | "aborted" | "error"): void => {
		act(() => {
			for (const handler of runningChangeHandlers) {
				handler({ sessionPath, running, ...(reason ? { reason } : {}) });
			}
		});
	};
	return { emit, notifyRunning };
}

/**
 * 打开会话并发送首条消息推进到 streaming，此后事件流彻底安静（悬挂形态）：
 * turn 永不结算，agent_end/aborted/error 都不会再到达。
 */
async function startWedgedStream(
	store: ReturnType<typeof getDefaultStore>,
	firstText: string,
): Promise<{
	emit: (event: Record<string, unknown>) => void;
	notifyRunning: (running: boolean, reason?: "agent_end" | "aborted" | "error") => void;
	settleFirstPrompt: (outcome: unknown) => void;
}> {
	const { emit, notifyRunning } = await openWithSubscription();
	const { inputValueAtom } = await import("@shared/store/atoms");
	store.set(inputValueAtom, firstText);
	let settleFirstPrompt: ((value: unknown) => void) | undefined;
	let firstPending: Promise<unknown> | undefined = new Promise<unknown>((resolve) => {
		settleFirstPrompt = resolve;
	});
	// 首条 prompt 悬挂直到 settleFirstPrompt（僵尸 turn 形态）；后续 prompt 一律 completed。
	mocks.prompt.mockImplementation(async () => {
		const pending = firstPending;
		firstPending = undefined;
		return pending ?? { status: "completed" };
	});
	const { activeSessionStreamingAtom, isStreamingAtom } = await import("@shared/store/atoms");
	await act(async () => {
		void manager?.sendMessage();
	});
	expect(mocks.prompt).toHaveBeenCalledTimes(1);
	emit({ type: "session.lifecycle", phase: "agent_start" });
	notifyRunning(true, undefined);
	expect(store.get(activeSessionStreamingAtom)).toBe(true);
	expect(store.get(isStreamingAtom)).toBe(true);
	return {
		emit,
		notifyRunning,
		settleFirstPrompt: (outcome) => settleFirstPrompt?.(outcome),
	};
}

/** 续发「追问」并断言直发合同：prompt 第二次被调、用户气泡上屏。 */
async function expectFollowUpSendable(store: ReturnType<typeof getDefaultStore>): Promise<void> {
	const { chatMessagesAtom, inputValueAtom } = await import("@shared/store/atoms");
	store.set(inputValueAtom, "追问");
	let second: Awaited<ReturnType<SessionManagerProbe["sendMessage"]>> | undefined;
	await act(async () => {
		second = await manager?.sendMessage();
	});
	expect(second?.status).toBe("sent");
	expect(mocks.prompt).toHaveBeenCalledTimes(2);
	const [, secondRequest] = mocks.prompt.mock.calls[1] as unknown as [string, { text: string }];
	expect(secondRequest.text).toBe("追问");
	expect(store.get(chatMessagesAtom).some((message) => message.kind === "user" && message.text === "追问")).toBe(true);
}

it("逃生舱：悬挂中按停止，宽限到期广播到达后界面收敛、错误上屏、同会话可续发", { timeout: 30_000 }, async () => {
	const store = await mount();
	const { activeSessionStreamingAtom, chatMessagesAtom, isStreamingAtom } = await import("@shared/store/atoms");
	const { emit, notifyRunning } = await startWedgedStream(store, "第一条消息");

	// 用户按停止：abort IPC 正常返回，但僵尸 turn 无视 AbortSignal，宽限期内无任何事件。
	// 此时界面必须仍在等待（收敛由事件驱动，不由 abort 回执驱动）。
	await act(async () => {
		await manager?.abortMessage();
	});
	expect(store.get(activeSessionStreamingAtom)).toBe(true);

	// 10s 宽限到期：kernel 收敛 recovery_required，宿主补发 error 观察事件 + 合成 agent_end。
	emit({
		type: "error",
		turnId: "turn-deadline-1",
		retryAttempts: 0,
		error: {
			code: "SESSION_CANCEL_DEADLINE_EXCEEDED",
			message: "The active turn did not settle within 10000ms after cancellation; the session requires recovery.",
			retryable: false,
			origin: "runtime",
		},
	});
	emit({ type: "session.lifecycle", phase: "agent_end" });
	notifyRunning(false, "error");

	await act(async () => {
		await vi.waitFor(() => expect(store.get(activeSessionStreamingAtom)).toBe(false));
	});
	expect(store.get(isStreamingAtom)).toBe(false);
	const agentMessages = store.get(chatMessagesAtom).filter((message) => message.kind === "agent");
	expect(
		agentMessages.some(
			(message) =>
				message.kind === "agent" &&
				message.blocks.some((block) => block.type === "error" && block.text.includes("did not settle within")),
		),
	).toBe(true);

	// 终态落地后同会话续发必须可达。
	await expectFollowUpSendable(store);
});

it("provider 停滞预算耗尽：stream_idle 错误终态到达后界面收敛、同会话可续发", { timeout: 30_000 }, async () => {
	const store = await mount();
	const { activeSessionStreamingAtom, chatMessagesAtom, isStreamingAtom } = await import("@shared/store/atoms");
	const { emit, notifyRunning, settleFirstPrompt } = await startWedgedStream(store, "第一条消息");

	// 零事件看门狗（180s）反复重试仍失败：失败按原样浮出，turn 以 error 终态结算。
	const stallMessage = "Provider stream stalled: no events for 180000ms (stream_idle_timeout)";
	emit({
		type: "error",
		turnId: "turn-stall-1",
		retryAttempts: 10,
		error: { code: "AI_TRANSPORT_FAILED", message: stallMessage, retryable: false, origin: "provider" },
	});
	emit({ type: "session.lifecycle", phase: "agent_end" });
	notifyRunning(false, "error");
	// prompt 回执以 failed 结算（与 error 事件同 turnId，渲染端按 turnId 去重）。
	settleFirstPrompt({
		status: "failed",
		turnId: "turn-stall-1",
		error: { code: "AI_TRANSPORT_FAILED", message: stallMessage, retryable: false, origin: "provider" },
	});

	await act(async () => {
		await vi.waitFor(() => expect(store.get(activeSessionStreamingAtom)).toBe(false));
	});
	expect(store.get(isStreamingAtom)).toBe(false);
	const agentMessages = store.get(chatMessagesAtom).filter((message) => message.kind === "agent");
	expect(
		agentMessages.some(
			(message) =>
				message.kind === "agent" &&
				message.blocks.some((block) => block.type === "error" && block.text.includes("stream_idle_timeout")),
		),
	).toBe(true);

	await expectFollowUpSendable(store);
});

it("终态事件丢失：prompt 回执 completed 到达但无任何 lifecycle 事件时不得永远转圈", { timeout: 30_000 }, async () => {
	const store = await mount();
	const { activeSessionStreamingAtom, chatMessagesAtom, inputValueAtom } = await import("@shared/store/atoms");
	const { settleFirstPrompt } = await startWedgedStream(store, "第一条消息");

	// agent_end 在 preload 容错被跳过 / IPC 半丢：kernel 已 idle，但渲染端收不到任何
	// 终态事件。此刻本地发送方的 completed 回执是唯一可知的终态事实——界面若继续
	// 转圈，停止按钮对着不存在的 turn，续发也被迫走 streaming 语义。
	settleFirstPrompt({ status: "completed" });
	await act(async () => {
		await Promise.resolve();
	});

	// 只断言本地 streaming 信号：isStreamingAtom 还叠加主进程 running 集合广播，
	// 该通道的失步修复（重同步/对账）是另一修复面，不在本合同内。
	expect(store.get(activeSessionStreamingAtom)).toBe(false);

	// 本地收敛后，续发消息必须送达 kernel。此时 running 集合通道尚未收敛（本用例
	// 刻意不广播），续发按 streaming 语义入队——kernel 已 idle，会直接开新 turn，
	// 消息不丢失；乐观气泡随 running 集合收敛（下一条 agent_end / 会话切换回填）
	// 一并恢复，故此处不断言气泡。
	store.set(inputValueAtom, "追问");
	let second: Awaited<ReturnType<SessionManagerProbe["sendMessage"]>> | undefined;
	await act(async () => {
		second = await manager?.sendMessage();
	});
	expect(second?.status).toBe("sent");
	expect(mocks.prompt).toHaveBeenCalledTimes(2);
	const [, secondRequest] = mocks.prompt.mock.calls[1] as unknown as [string, { text: string }];
	expect(secondRequest.text).toBe("追问");
	expect(store.get(chatMessagesAtom).some((message) => message.kind === "user" && message.text === "第一条消息")).toBe(
		true,
	);
});
