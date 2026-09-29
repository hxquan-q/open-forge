// @vitest-environment jsdom

import { resolveConversationAgentText } from "@shared/conversation";
import type { ChatTimelineItem, OpenSessionOptions, SessionExecutionMode } from "@shared/store/atoms";
import { getDefaultStore } from "jotai";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

/** 历史回放的助手消息只保留 blocks，比较可见文本时按 blocks 派生（TASK-0036）。 */
function visibleMessageText(message: ChatTimelineItem): string {
	if (message.kind === "event" || message.kind === "placeholder") return "";
	return message.kind === "agent" ? resolveConversationAgentText(message) : message.text;
}

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
const runtimeId = "runtime-abort-resume";

/** useRunningSessionsSync 在 mount 时即订阅；此处集中收集 handler 供用例广播。 */
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
		// App 根级挂载的 running 集合同步（isStreamingAtom 的主进程广播真值来源）。
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

/** 打开会话并发送首条消息，推进入 streaming；返回首条 prompt 回执的显式释放点。 */
async function startStreamingTurn(
	store: ReturnType<typeof getDefaultStore>,
	firstText: string,
	followUpPromptOutcomes?: readonly unknown[],
): Promise<{
	emit: (event: Record<string, unknown>) => void;
	notifyRunning: (running: boolean, reason?: "agent_end" | "aborted" | "error") => void;
	completeFirstPrompt: () => void;
}> {
	const { emit, notifyRunning } = await openWithSubscription();
	// openSession 会按 sessionPath 装载会话草稿，输入必须在打开后再写入。
	const { inputValueAtom } = await import("@shared/store/atoms");
	store.set(inputValueAtom, firstText);
	let releaseFirstPrompt: ((value: unknown) => void) | undefined;
	const firstPromptOutcome = new Promise<unknown>((resolve) => {
		releaseFirstPrompt = resolve;
	});
	const followUpOutcomes: unknown[] = [
		...(followUpPromptOutcomes ?? [
			{ status: "completed" },
			{ status: "queued", pendingCount: 1, queueItemId: "q-extra" },
		]),
	];
	const handlers: Array<() => Promise<unknown>> = [
		() => firstPromptOutcome,
		...followUpOutcomes.map((outcome) => async () => outcome),
	];
	mocks.prompt.mockImplementation(async () => handlers.shift()?.() ?? { status: "completed" });
	const { activeSessionStreamingAtom, isStreamingAtom } = await import("@shared/store/atoms");
	// 不 await 首条发送：prompt IPC 到 turn 结束才 resolve，事件先行的正是真实时序。
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
		completeFirstPrompt: () => releaseFirstPrompt?.({ status: "completed" }),
	};
}

it(
	"停止控件：kernel 正常收敛（aborted → agent_end → running=false）后界面回终态，同会话可继续发送",
	{ timeout: 30_000 },
	async () => {
		const historyRef: { current: unknown[] } = { current: [] };
		const sessionApi = (window as unknown as { vetta: { session: Record<string, unknown> } }).vetta.session;
		sessionApi.getFullHistory = vi.fn(async () => historyRef.current);
		const store = await mount();
		const { activeSessionStreamingAtom, chatMessagesAtom, isStreamingAtom } = await import("@shared/store/atoms");
		const { emit, notifyRunning, completeFirstPrompt } = await startStreamingTurn(store, "第一条消息");

		// 用户点击停止控件：kernel 处理 AbortSignal 后正常收敛，广播 aborted/agent_end 与 running=false。
		sessionApi.abort = vi.fn(async () => {
			// getFullHistory stub 在调用瞬间读 historyRef，必须先推进历史再广播事件。
			historyRef.current = [
				{ type: "message", entryId: "u-1", message: { role: "user", content: "第一条消息" } },
				{
					type: "message",
					entryId: "a-1",
					message: { role: "assistant", content: [{ type: "text", text: "部分回复" }], stopReason: "aborted" },
				},
			];
			emit({ type: "message.delta", delta: "部分回复" });
			emit({ type: "session.lifecycle", phase: "aborted" });
			emit({ type: "session.lifecycle", phase: "agent_end" });
			notifyRunning(false, "aborted");
		});
		await act(async () => {
			await manager?.abortMessage();
		});
		completeFirstPrompt();

		await act(async () => {
			await vi.waitFor(() => expect(store.get(activeSessionStreamingAtom)).toBe(false));
		});
		expect(store.get(isStreamingAtom)).toBe(false);
		const finalized = store.get(chatMessagesAtom).filter((message) => message.kind === "agent");
		expect(finalized.length).toBeGreaterThan(0);
		const tail = finalized.at(-1);
		expect(tail && tail.kind === "agent" && tail.endedAt !== undefined).toBe(true);
		expect(tail && tail.kind === "agent" && (tail.durationSeconds ?? -1)).toBeGreaterThanOrEqual(0);
		expect(visibleMessageText(tail as ChatTimelineItem)).toContain("部分回复");

		// 中断终态之后，同一会话立即继续发送必须可达：乐观气泡上屏、prompt 直发 kernel。
		const { inputValueAtom } = await import("@shared/store/atoms");
		store.set(inputValueAtom, "追问");
		let second: Awaited<ReturnType<SessionManagerProbe["sendMessage"]>> | undefined;
		await act(async () => {
			second = await manager?.sendMessage();
		});
		expect(second?.status).toBe("sent");
		expect(mocks.prompt).toHaveBeenCalledTimes(2);
		const [, secondRequest] = mocks.prompt.mock.calls[1] as unknown as [
			string,
			{ text: string; streamingBehavior?: string },
		];
		expect(secondRequest.text).toBe("追问");
		expect(store.get(chatMessagesAtom).some((message) => message.kind === "user" && message.text === "追问")).toBe(
			true,
		);
	},
);

it(
	"停止窗口内发送：消息经 queued 回执入队不丢失，pause-on-terminal 后镜像可见，恢复即消费补气泡",
	{ timeout: 30_000 },
	async () => {
		const store = await mount();
		const { activeSessionStreamingAtom, chatMessagesAtom, inputValueAtom, isStreamingAtom } = await import(
			"@shared/store/atoms"
		);
		const { messageQueueBySessionAtom, messageQueuePausedBySessionAtom } = await import(
			"@shared/store/message-queue-atoms"
		);
		const { emit, notifyRunning } = await startStreamingTurn(store, "第一条消息", [
			{ status: "queued", pendingCount: 1, queueItemId: "q-win" },
		]);

		// kernel 进入 cancelling：停止 IPC 已受理，但 turn 仍在收敛中，无事件广播。
		let releaseUnwind: (() => void) | undefined;
		const sessionApi = (window as unknown as { vetta: { session: Record<string, unknown> } }).vetta.session;
		sessionApi.abort = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					releaseUnwind = resolve;
				}),
		);
		void manager?.abortMessage();

		// 停止窗口内用户继续发送：streaming 语义生效（无乐观气泡），kernel 队列受理（queued 回执）。
		store.set(inputValueAtom, "窗口消息");
		let windowed: Awaited<ReturnType<SessionManagerProbe["sendMessage"]>> | undefined;
		await act(async () => {
			windowed = await manager?.sendMessage();
		});
		expect(windowed).toEqual({ status: "queued", queueItemId: "q-win" });
		emit({
			type: "queue.changed",
			paused: false,
			entries: [{ id: "q-win", behavior: "followUp", displayText: "窗口消息" }],
			snapshot: {},
		});
		expect(
			store.get(chatMessagesAtom).some((message) => message.kind === "user" && message.text === "窗口消息"),
		).toBe(false);
		expect(
			store
				.get(messageQueueBySessionAtom)
				.get(runtimeId)
				?.map((entry) => entry.displayText),
		).toEqual(["窗口消息"]);

		// turn 以 cancelled 结算：pause-on-terminal 冻结队列（窗口消息仍在），aborted 终态广播。
		emit({
			type: "queue.changed",
			paused: true,
			entries: [{ id: "q-win", behavior: "followUp", displayText: "窗口消息" }],
			snapshot: {},
		});
		emit({ type: "session.lifecycle", phase: "aborted" });
		emit({ type: "session.lifecycle", phase: "agent_end" });
		notifyRunning(false, "aborted");
		await act(async () => {
			releaseUnwind?.();
		});
		await act(async () => {
			await vi.waitFor(() => expect(store.get(activeSessionStreamingAtom)).toBe(false));
		});
		expect(store.get(isStreamingAtom)).toBe(false);
		expect(store.get(messageQueuePausedBySessionAtom).get(runtimeId)).toBe(true);
		expect(
			store
				.get(messageQueueBySessionAtom)
				.get(runtimeId)
				?.map((entry) => entry.displayText),
		).toEqual(["窗口消息"]);
		expect(
			store.get(chatMessagesAtom).some((message) => message.kind === "user" && message.text === "窗口消息"),
		).toBe(false);

		// 用户点「继续」：kernel 恢复并消费唯一条目；渲染端按差分补出用户气泡。
		emit({ type: "queue.changed", paused: false, entries: [], snapshot: {} });
		expect(
			store.get(chatMessagesAtom).some((message) => message.kind === "user" && message.text === "窗口消息"),
		).toBe(true);
		expect(store.get(messageQueueBySessionAtom).get(runtimeId)).toBeUndefined();
		expect(store.get(messageQueuePausedBySessionAtom).get(runtimeId)).toBeUndefined();
	},
);

it("停止 IPC 悬挂不阻塞界面收敛：流式终态与续发由事件驱动，不等待 abort 回执", { timeout: 30_000 }, async () => {
	const store = await mount();
	const { activeSessionStreamingAtom, chatMessagesAtom, inputValueAtom, isStreamingAtom } = await import(
		"@shared/store/atoms"
	);
	const { emit, notifyRunning, completeFirstPrompt } = await startStreamingTurn(store, "第一条消息");

	// 方向④的可证伪场景：主进程 abort IPC 因等待后台工作停止而迟迟不返回，
	// 但 kernel 已收敛并广播终态事件——界面收敛不得依赖 abort 回执。
	const sessionApi = (window as unknown as { vetta: { session: Record<string, unknown> } }).vetta.session;
	sessionApi.abort = vi.fn(() => new Promise<void>(() => {}));
	let abortSettled = false;
	const abortPromise = manager?.abortMessage().then(
		() => {
			abortSettled = true;
		},
		() => {
			abortSettled = true;
		},
	);
	emit({ type: "session.lifecycle", phase: "aborted" });
	emit({ type: "session.lifecycle", phase: "agent_end" });
	notifyRunning(false, "aborted");
	completeFirstPrompt();

	await act(async () => {
		await vi.waitFor(() => expect(store.get(activeSessionStreamingAtom)).toBe(false));
	});
	expect(store.get(isStreamingAtom)).toBe(false);

	store.set(inputValueAtom, "追问");
	let second: Awaited<ReturnType<SessionManagerProbe["sendMessage"]>> | undefined;
	await act(async () => {
		second = await manager?.sendMessage();
	});
	expect(second?.status).toBe("sent");
	expect(mocks.prompt).toHaveBeenCalledTimes(2);
	expect(store.get(chatMessagesAtom).some((message) => message.kind === "user" && message.text === "追问")).toBe(true);
	// abort 回执始终未返回，界面状态与续发都不受它阻塞。
	await act(async () => {
		await Promise.race([abortPromise, new Promise((resolve) => setTimeout(resolve, 20))]);
	});
	expect(abortSettled).toBe(false);
});
