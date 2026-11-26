// Modified by The Open Forge contributors.

/**
 * 断言深度豁免理由：task-executor 本身是对接 conversation-service / runtime 的
 * 编排边界——正确性体现在 IPC 入参（会话创建的 cwd/执行模式/场景、prompt 的
 * 模型与 metadata、openSession 的会话路径）与「失效目标不得创建会话」这类负向合同，
 * 无法从最终状态区分。持久化结果已改用可观察事实断言（writeRecord 落盘数组、
 * attention 记录、permission 注册表）；基线随编排面重写同步调高。
 */

import type { RuntimeHost, RuntimeTurnPromptOutcome, SessionEvent, SessionExecutionMode } from "@vetta/runtime-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduledTask, TaskExecutionRecord } from "./task-storage.js";

const CONVERSATION_CWD = "C:/home/.vetta/conversation";
const PROJECT_CWD = "C:/workspace/project";

const mocks = vi.hoisted(() => ({
	createSession: vi.fn(),
	openSession: vi.fn(),
	emitTaskEvent: vi.fn(),
	emitTaskStreamEvent: vi.fn(),
	existing: new Set<string>(),
	attention: [] as Array<[string, string]>,
	projects: [] as Array<{ path: string }>,
	records: [] as TaskExecutionRecord[],
	updateTask: vi.fn(),
	updateTaskLastRun: vi.fn(async () => {}),
}));

vi.mock("node:fs", () => ({ existsSync: (path: string) => mocks.existing.has(path) }));
vi.mock("../app-monitor/app-monitor-service.js", () => ({ recordAutomationRunStarted: vi.fn() }));
vi.mock("../conversations/desktop-conversation-service.js", () => ({
	getDesktopConversationService: () => ({ createSession: mocks.createSession, openSession: mocks.openSession }),
}));
vi.mock("../conversations/session-paths.js", () => ({
	isConversationCwd: (cwd: string) => cwd === CONVERSATION_CWD,
}));
vi.mock("../i18n/index.js", () => ({ mainT: (key: string) => key }));
vi.mock("../ipc/fs.js", () => ({
	readDesktopConfig: async () => ({ projects: mocks.projects, archivedProjects: [], defaultExecutionMode: "sandbox" }),
}));
vi.mock("../ipc/scheduler.js", () => ({
	emitTaskEvent: mocks.emitTaskEvent,
	emitTaskStreamEvent: mocks.emitTaskStreamEvent,
}));
vi.mock("../logger.js", () => ({ getAppLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }) }));
vi.mock("../models/model-settings-host.js", () => ({
	getDesktopModelSettingsService: () => ({ list: async () => ({ defaultModel: "default/model" }) }),
}));
vi.mock("../notifications/index.js", () => ({
	recordSessionAttention: (sessionPath: string, kind: string) => mocks.attention.push([sessionPath, kind]),
}));
vi.mock("../projects/project-path.js", () => ({ sameProjectPath: (a: string, b: string) => a === b }));
vi.mock("../sandbox/capability.js", () => ({ assertSandboxAvailableForMode: async () => {} }));
vi.mock("./task-storage.js", () => ({
	generateId: () => `record-${mocks.records.length + 1}`,
	updateTask: mocks.updateTask,
	updateTaskLastRun: mocks.updateTaskLastRun,
	writeRecord: async (record: TaskExecutionRecord) => {
		mocks.records.push(record);
	},
}));

import { executeTask, isTaskRunning, shutdownSchedulerTaskExecutor } from "./task-executor.js";
import {
	clearUnattendedPermissionTierForTests,
	getUnattendedPermissionTiersForSession,
} from "./unattended-permission-session-registry.js";

interface FakeRuntimeOptions {
	readonly outcome?: RuntimeTurnPromptOutcome;
	readonly prompt?: () => Promise<RuntimeTurnPromptOutcome>;
	readonly permissionMode?: "default" | "plan";
	/** 执行中发出这些会话事件，驱动本地保留的流式转发。 */
	readonly streamEvents?: readonly SessionEvent[];
}

function fakeRuntime(options: FakeRuntimeOptions = {}) {
	const handlers = new Set<(event: SessionEvent) => void>();
	const runtime = {
		prompt: vi.fn(async () => {
			for (const event of options.streamEvents ?? []) {
				for (const handler of handlers) handler(event);
			}
			return options.prompt ? await options.prompt() : (options.outcome ?? { status: "completed", turnId: "t1" });
		}),
		abort: vi.fn(async () => {}),
		renameSessionById: vi.fn(async () => {}),
		getState: vi.fn(() => ({ isStreaming: false, executionMode: "full-access" as SessionExecutionMode })),
		setExecutionMode: vi.fn(async () => {}),
		invokeSessionExtensionSync: vi.fn(
			(_id: string, token: { endpoint?: string }, input?: { permissionMode: "default" | "plan" }) => {
				void token;
				if (options.permissionMode === undefined) throw new Error("plan mode unavailable");
				if (!input) return { permissionMode: options.permissionMode };
				return { permissionMode: input.permissionMode };
			},
		),
		getMessages: vi.fn(() => [
			{ role: "user", content: "run" },
			{ role: "assistant", content: [{ type: "text", text: "all done" }] },
		]),
		subscribe: vi.fn((_sessionId: string, handler: (event: SessionEvent) => void) => {
			handlers.add(handler);
			return () => handlers.delete(handler);
		}),
		getSessionPath: vi.fn(() => undefined),
	};
	return {
		runtime: runtime as unknown as RuntimeHost & typeof runtime,
		handlers,
	};
}

function task(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
	return {
		id: "task-1",
		name: "Daily report",
		prompt: "Summarize today",
		schedule: { kind: "daily", hour: 9, minute: 0 },
		runTarget: { mode: "new-session", projectCwd: PROJECT_CWD },
		enabled: true,
		createdAt: 1,
		updatedAt: 1,
		lastRunAt: null,
		lastRunStatus: null,
		...overrides,
	};
}

function session(sessionPath = "C:/sessions/new.jsonl") {
	return { sessionId: "session-1", sessionPath, cwd: PROJECT_CWD, listCwd: PROJECT_CWD, source: "automation" };
}

describe("automation task executor", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.records.length = 0;
		mocks.attention.length = 0;
		mocks.existing.clear();
		mocks.projects = [{ path: PROJECT_CWD }];
		mocks.createSession.mockResolvedValue(session());
		mocks.openSession.mockResolvedValue(session("C:/sessions/bound.jsonl"));
		mocks.updateTask.mockImplementation(async (_id: string, update: (current: ScheduledTask) => ScheduledTask) =>
			update(task()),
		);
		clearUnattendedPermissionTierForTests();
	});

	it("runs a new-session automation in the chosen project as an unattended work turn", async () => {
		const { runtime } = fakeRuntime();
		await executeTask(task(), runtime, { trigger: "schedule" });

		// 任务未声明 executionMode 时回落到宿主默认（本地保留 ADR-0132 三态，不强制 full-access）。
		expect(mocks.createSession).toHaveBeenCalledWith(
			{ cwd: PROJECT_CWD, executionMode: "sandbox", agentMode: "work", scenario: "automation" },
			"other",
			"automation",
		);
		expect(runtime.prompt).toHaveBeenCalledWith("session-1", {
			text: "Summarize today",
			modelKey: "default/model",
			metadata: { unattended: true, automationTaskId: "task-1" },
		});
		expect(mocks.emitTaskEvent).toHaveBeenCalledWith(
			expect.objectContaining({ type: "task.started", listCwd: PROJECT_CWD, mode: "new-session" }),
		);
		expect(mocks.records.at(-1)).toMatchObject({
			status: "success",
			sessionPath: "C:/sessions/new.jsonl",
			responsePreview: "all done",
			mode: "new-session",
		});
		expect(mocks.updateTaskLastRun).toHaveBeenCalledWith("task-1", "success");
		expect(mocks.attention).toEqual([]);
		expect(isTaskRunning("task-1")).toBe(false);
	});

	it("creates the session in the task declared execution mode", async () => {
		const { runtime } = fakeRuntime();
		await executeTask(task({ executionMode: "full-access" }), runtime, { trigger: "schedule" });

		expect(mocks.createSession).toHaveBeenCalledWith(
			expect.objectContaining({ executionMode: "full-access" }),
			"other",
			"automation",
		);
	});

	it("passes the explicit model, reasoning and skill promptRef", async () => {
		const { runtime } = fakeRuntime();
		await executeTask(
			task({
				prompt: "check the diff",
				model: { key: "anthropic/opus", reasoning: "high" },
				skill: { type: "skill", name: "scheduled-skill" },
			}),
			runtime,
			{ trigger: "manual" },
		);

		expect(runtime.prompt).toHaveBeenCalledWith(
			"session-1",
			expect.objectContaining({
				text: "check the diff",
				modelKey: "anthropic/opus",
				reasoning: "high",
				promptRef: { kind: "skill", name: "scheduled-skill" },
			}),
		);
	});

	it("forwards assistant stream events while the turn runs", async () => {
		const { runtime, handlers } = fakeRuntime({
			streamEvents: [
				{
					schemaVersion: 1,
					sessionId: "session-1",
					eventId: "e1",
					timestamp: 1,
					source: "runtime-core",
					type: "message.delta",
					delta: "streamed",
				} as SessionEvent,
			],
		});
		await executeTask(task(), runtime, { trigger: "schedule" });

		expect(mocks.emitTaskStreamEvent).toHaveBeenCalledWith({
			taskId: "task-1",
			sessionId: "session-1",
			type: "message.delta",
			delta: "streamed",
		});
		expect(handlers.size).toBe(0);
	});

	it("records a failed turn as failed instead of success", async () => {
		const { runtime } = fakeRuntime({
			outcome: { status: "failed", turnId: "t1", error: { message: "provider down" } } as RuntimeTurnPromptOutcome,
		});
		await executeTask(task(), runtime, { trigger: "schedule" });

		expect(mocks.records.at(-1)).toMatchObject({ status: "failed", error: "provider down" });
		expect(mocks.updateTaskLastRun).toHaveBeenCalledWith("task-1", "failed");
		expect(mocks.attention).toEqual([["C:/sessions/new.jsonl", "unread-result"]]);
	});

	it("binds unattended permission tiers for the turn and releases them afterwards", async () => {
		const { runtime } = fakeRuntime({
			prompt: async () => {
				expect(getUnattendedPermissionTiersForSession("session-1")).toEqual({ allowWorkspaceWrite: true });
				return { status: "completed", turnId: "t1" };
			},
		});
		await executeTask(task({ permissionTiers: { allowWorkspaceWrite: true } }), runtime, { trigger: "schedule" });

		expect(getUnattendedPermissionTiersForSession("session-1")).toBeUndefined();
	});

	it("skips a scheduled trigger while the previous run is still going", async () => {
		let finish: (outcome: RuntimeTurnPromptOutcome) => void = () => {};
		const { runtime } = fakeRuntime({
			prompt: () =>
				new Promise<RuntimeTurnPromptOutcome>((resolve) => {
					finish = resolve;
				}),
		});
		const first = executeTask(task(), runtime, { trigger: "schedule" });
		await vi.waitFor(() => expect(runtime.prompt).toHaveBeenCalledOnce());

		await executeTask(task(), runtime, { trigger: "schedule" });
		await expect(executeTask(task(), runtime, { trigger: "manual" })).rejects.toThrow("already running");
		finish({ status: "completed", turnId: "t1" });
		await first;

		expect(mocks.records.filter((record) => record.status === "skipped")).toEqual([
			expect.objectContaining({ reason: "previous-running", completedAt: expect.any(Number) }),
		]);
		expect(runtime.prompt).toHaveBeenCalledOnce();
	});

	it("suspends instead of silently replacing a deleted bound session", async () => {
		const { runtime } = fakeRuntime();
		const onTaskChanged = vi.fn();
		await executeTask(
			task({ runTarget: { mode: "same-session", projectCwd: PROJECT_CWD, sessionPath: "C:/sessions/gone.jsonl" } }),
			runtime,
			{ trigger: "schedule", onTaskChanged },
		);

		expect(mocks.createSession).not.toHaveBeenCalled();
		expect(mocks.openSession).not.toHaveBeenCalled();
		expect(onTaskChanged).toHaveBeenCalledWith(
			expect.objectContaining({ enabled: false, suspendedReason: "session-deleted" }),
		);
		expect(mocks.records.at(-1)).toMatchObject({ status: "failed", error: "automation:suspended.session-deleted" });
	});

	it("suspends when the target project left the sidebar", async () => {
		mocks.projects = [];
		const { runtime } = fakeRuntime();
		const onTaskChanged = vi.fn();
		await executeTask(task(), runtime, { trigger: "schedule", onTaskChanged });

		expect(onTaskChanged).toHaveBeenCalledWith(expect.objectContaining({ suspendedReason: "project-removed" }));
		expect(runtime.prompt).not.toHaveBeenCalled();
	});

	it("creates the same-session conversation once and binds it after it lands on disk", async () => {
		mocks.existing.add("C:/sessions/new.jsonl");
		const { runtime } = fakeRuntime();
		const onTaskChanged = vi.fn();
		const sameSessionTask = task({
			runTarget: { mode: "same-session", projectCwd: CONVERSATION_CWD, sessionPath: null },
		});
		mocks.updateTask.mockImplementation(async (_id: string, update: (current: ScheduledTask) => ScheduledTask) =>
			update(sameSessionTask),
		);
		await executeTask(sameSessionTask, runtime, { trigger: "schedule", onTaskChanged });

		expect(mocks.createSession).toHaveBeenCalledWith(
			{ cwd: CONVERSATION_CWD, executionMode: "sandbox", agentMode: "work" },
			"conversation",
			"automation",
		);
		expect(runtime.renameSessionById).toHaveBeenCalledWith("session-1", "Daily report");
		expect(onTaskChanged).toHaveBeenCalledWith(
			expect.objectContaining({ runTarget: expect.objectContaining({ sessionPath: "C:/sessions/new.jsonl" }) }),
		);
	});

	it("opens a bound session in the task execution mode outside plan mode", async () => {
		mocks.existing.add("C:/sessions/bound.jsonl");
		const permissionCalls: unknown[] = [];
		const { runtime } = fakeRuntime({ permissionMode: "plan" });
		runtime.invokeSessionExtensionSync.mockImplementation((_id: string, _token: unknown, input?: unknown) => {
			permissionCalls.push(input ?? "read");
			return { permissionMode: "plan" };
		});
		await executeTask(
			task({
				executionMode: "full-access",
				runTarget: { mode: "same-session", projectCwd: PROJECT_CWD, sessionPath: "C:/sessions/bound.jsonl" },
			}),
			runtime,
			{ trigger: "schedule" },
		);

		expect(mocks.openSession).toHaveBeenCalledWith("C:/sessions/bound.jsonl", "full-access", "automation");
		expect(runtime.renameSessionById).not.toHaveBeenCalled();
		expect(permissionCalls).toContainEqual({ permissionMode: "default" });
		expect(permissionCalls[permissionCalls.length - 1]).toEqual({ permissionMode: "plan" });
	});

	it("aborts active work and rejects work after shutdown", async () => {
		const { runtime } = fakeRuntime({
			prompt: () =>
				new Promise<RuntimeTurnPromptOutcome>((resolve) => {
					runtime.abort.mockImplementation(async () => resolve({ status: "cancelled" }));
				}),
		});
		const execution = executeTask(task(), runtime, { trigger: "schedule" });
		await vi.waitFor(() => expect(runtime.prompt).toHaveBeenCalledOnce());

		await Promise.all([shutdownSchedulerTaskExecutor(), shutdownSchedulerTaskExecutor(), execution]);

		expect(runtime.abort).toHaveBeenCalledOnce();
		expect(mocks.records.at(-1)).toMatchObject({ status: "aborted" });
		await expect(executeTask(task(), runtime, { trigger: "schedule" })).rejects.toThrow(
			"Scheduler task executor is shutting down",
		);
	});
});
