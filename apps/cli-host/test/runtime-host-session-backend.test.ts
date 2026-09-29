import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Api, type AssistantMessage, type AssistantMessageEvent, EventStream, type Model } from "@vetta/ai";
import { createCodingAgentRuntimeHostSessionConfig } from "@vetta/coding-agent/composition";
import type { CodingAgentRuntimeModelSource } from "@vetta/coding-agent/host-services";
import { SandboxUnavailableError } from "@vetta/coding-agent/sandbox/errors";
import { CODING_AGENT_SESSION_PROFILE_STATE_READ } from "@vetta/coding-agent/session-extensions";
import { RuntimeHost, type SessionEvent } from "@vetta/runtime-core";
import { afterEach, describe, expect, it } from "vitest";
import {
	createCodingAgentRuntimeComposition,
	createUnsandboxedTestSessionExecutionEnvironment,
} from "./fixtures/runtime-composition.js";

describe("Coding Agent RuntimeHost backend", () => {
	const directories: string[] = [];
	const disposers: Array<() => Promise<void>> = [];

	afterEach(async () => {
		for (const dispose of disposers.splice(0).reverse()) await dispose();
		for (const directory of directories.splice(0).reverse()) {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("maps supported RuntimeHost session options and resumes the persisted conversation", async () => {
		const cwd = await temporaryDirectory("greenfield-host-workspace-");
		const conversationDir = await temporaryDirectory("greenfield-host-conversations-");
		const composition = await createCodingAgentRuntimeComposition({
			conversationDir,
			cwd,
			createSessionExecutionEnvironment: createUnsandboxedTestSessionExecutionEnvironment,
			scenario: "batch",
			enableSubagents: false,
			modelRegistry: modelRegistry(),
			initialModel: MODEL,
			initialThinkingLevel: "off",
		});
		const runtime = new RuntimeHost({ sessionBackend: composition.runtimeHostBackend });
		disposers.push(async () => {
			await runtime.disposeAllSessions();
			await composition.dispose();
		});

		const sessionOptions = {
			sessionId: "runtime-host-session",
			cwd,
			model: SECOND_MODEL,
			thinkingLevel: "medium" as const,
			executionMode: "full-access" as const,
			enableBackgroundTasks: false,
			includeAgentSkills: false,
			systemPromptAddon: "runtime-host-addon",
		};
		const created = await runtime.createSession(
			createCodingAgentRuntimeHostSessionConfig(composition.agentRuntime, sessionOptions, {
				sessionDir: conversationDir,
				scenario: "batch",
			}),
		);
		expect(runtime.getState(created.sessionId)).toMatchObject({
			model: SECOND_MODEL,
			thinkingLevel: "medium",
			executionMode: "full-access",
		});
		expect(
			runtime.invokeSessionExtensionSync(created.sessionId, CODING_AGENT_SESSION_PROFILE_STATE_READ, undefined)
				.scenario,
		).toBe("batch");
		expect(runtime.getState(created.sessionId).activeToolNames).not.toContain("task_output");
		const sessionPath = runtime.getSessionPath(created.sessionId);
		expect(sessionPath).toBeDefined();
		await runtime.disposeSession(created.sessionId);
		expect(() => runtime.getState(created.sessionId)).toThrow("Session not found");

		const resumed = await runtime.createSession(
			createCodingAgentRuntimeHostSessionConfig(composition.agentRuntime, sessionOptions, {
				sessionDir: conversationDir,
				sessionPath,
				scenario: "batch",
			}),
		);
		expect(resumed.sessionId).toBe(created.sessionId);

		const whitespacePath = await runtime.createSession(
			createCodingAgentRuntimeHostSessionConfig(
				composition.agentRuntime,
				{ ...sessionOptions, sessionId: "whitespace-path-session" },
				{ sessionDir: conversationDir, sessionPath: "   ", scenario: "batch" },
			),
		);
		expect(whitespacePath.sessionId).not.toBe(created.sessionId);
	});

	it("fails closed for an unknown Agent or malformed private Session payload", async () => {
		const cwd = await temporaryDirectory("greenfield-host-gate-workspace-");
		const conversationDir = await temporaryDirectory("greenfield-host-gate-conversations-");
		const composition = await createCodingAgentRuntimeComposition({
			conversationDir,
			cwd,
			createSessionExecutionEnvironment: createUnsandboxedTestSessionExecutionEnvironment,
			scenario: "batch",
			enableSubagents: false,
			modelRegistry: modelRegistry(),
			initialModel: MODEL,
			initialThinkingLevel: "off",
		});
		const runtime = new RuntimeHost({ sessionBackend: composition.runtimeHostBackend });
		disposers.push(async () => {
			await runtime.disposeAllSessions();
			await composition.dispose();
		});

		await expect(
			runtime.createSession({
				agent: { id: "reviewer", sessionConfiguration: { sessionId: "unknown-agent" } },
			}),
		).rejects.toThrow("cannot execute Agent reviewer");
		await expect(
			runtime.createSession({
				agent: {
					id: composition.agentRuntime.agentId,
					sessionConfiguration: { sessionId: " malformed " },
				},
			}),
		).rejects.toThrow("sessionId must be a non-empty trimmed string");
	});

	it("retries transient model failures and suppresses recovered error events", async () => {
		const cwd = await temporaryDirectory("greenfield-host-retry-workspace-");
		const conversationDir = await temporaryDirectory("greenfield-host-retry-conversations-");
		const responses = [assistantMessage("error", "503 service unavailable"), assistantMessage("stop")];
		let callCount = 0;
		const composition = await createCodingAgentRuntimeComposition({
			conversationDir,
			cwd,
			createSessionExecutionEnvironment: createUnsandboxedTestSessionExecutionEnvironment,
			scenario: "batch",
			enableSubagents: false,
			modelRegistry: modelRegistry(),
			initialModel: MODEL,
			initialThinkingLevel: "off",
			streamFn: () => new RecordedAssistantStream(responses[callCount++] ?? assistantMessage("stop")),
			runtimeHostRetrySettings: {
				getRetrySettings: () => ({ enabled: true, maxRetries: 1, baseDelayMs: 0, maxDelayMs: 0 }),
				setRetryEnabled() {},
			},
		});
		const runtime = new RuntimeHost({ sessionBackend: composition.runtimeHostBackend });
		disposers.push(async () => {
			await runtime.disposeAllSessions();
			await composition.dispose();
		});
		const { sessionId } = await runtime.createSession(
			createCodingAgentRuntimeHostSessionConfig(
				composition.agentRuntime,
				// 无沙箱测试环境 + ADR-0133 fail-closed:显式 full-access,避免默认 sandbox 触发
				// SandboxUnavailableError 让会话创建失败(本测试只关注模型重试)。
				{ sessionId: "retry-session", cwd, executionMode: "full-access" },
				{ sessionDir: conversationDir, scenario: "batch" },
			),
		);
		const events: SessionEvent[] = [];
		const unsubscribe = runtime.subscribe(sessionId, (event) => events.push(event));

		await runtime.prompt(sessionId, { text: "hello" });
		unsubscribe();

		expect(callCount).toBe(2);
		const eventTypes = events.map((event) => event.type);
		expect(eventTypes).toContain("retry.start");
		expect(eventTypes).toContain("retry.end");
		expect(events.some((event) => event.channel === "assistant" && event.type === "error")).toBe(true);
		expect(events.filter((event) => event.channel !== "assistant").map((event) => event.type)).not.toContain("error");
	});

	it("rejects session creation when the default sandbox mode meets a host without a sandbox", async () => {
		// ADR-0133 P0:RuntimeHost 默认执行模式是 sandbox;宿主声明无沙箱(远程项目分支、
		// 无沙箱测试装置)时,会话创建必须显式失败——而不是建出核心工具整组消失的死会话。
		const cwd = await temporaryDirectory("greenfield-host-nosandbox-workspace-");
		const conversationDir = await temporaryDirectory("greenfield-host-nosandbox-conversations-");
		const composition = await createCodingAgentRuntimeComposition({
			conversationDir,
			cwd,
			createSessionExecutionEnvironment: createUnsandboxedTestSessionExecutionEnvironment,
			scenario: "batch",
			enableSubagents: false,
			modelRegistry: modelRegistry(),
			initialModel: MODEL,
			initialThinkingLevel: "off",
		});
		const runtime = new RuntimeHost({ sessionBackend: composition.runtimeHostBackend });
		disposers.push(async () => {
			await runtime.disposeAllSessions();
			await composition.dispose();
		});
		// VETTA_SANDBOX_FAIL_OPEN 若被外部环境设置会把 fail-closed 翻成 fail-open,先摘掉保证确定。
		const previousFailOpen = process.env.VETTA_SANDBOX_FAIL_OPEN;
		delete process.env.VETTA_SANDBOX_FAIL_OPEN;

		try {
			// 不传 executionMode:吃 RuntimeHost 的默认 sandbox,复现真实无沙箱宿主的组合
			await expect(
				runtime.createSession(
					createCodingAgentRuntimeHostSessionConfig(
						composition.agentRuntime,
						{ sessionId: "nosandbox-session", cwd },
						{ sessionDir: conversationDir, scenario: "batch" },
					),
				),
			).rejects.toThrow(SandboxUnavailableError);
		} finally {
			if (previousFailOpen !== undefined) process.env.VETTA_SANDBOX_FAIL_OPEN = previousFailOpen;
		}

		// 失败的会话不得留下半装配的会话目录
		const leftovers = await readdir(conversationDir);
		expect(leftovers.filter((entry) => entry.includes("nosandbox-session"))).toEqual([]);
	});

	async function temporaryDirectory(prefix: string): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), prefix));
		directories.push(directory);
		return directory;
	}
});

function modelRegistry(): CodingAgentRuntimeModelSource {
	return {
		refresh() {},
		getAvailable: () => [MODEL, SECOND_MODEL],
		find: (provider, modelId) =>
			[MODEL, SECOND_MODEL].find((model) => model.provider === provider && model.id === modelId),
		getApiKey: async () => "test-key",
		setServerToken() {},
		loadRemoteModels: async () => undefined,
	};
}

const MODEL: Model<Api> = {
	id: "default-model",
	name: "Default Model",
	api: "openai-responses",
	provider: "test",
	baseUrl: "https://example.test",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8_000,
	maxTokens: 1_000,
};

const SECOND_MODEL: Model<Api> = {
	...MODEL,
	id: "session-model",
	name: "Session Model",
};

class RecordedAssistantStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
	constructor(message: AssistantMessage) {
		super(
			(event) => event.type === "done" || event.type === "error",
			(event) => {
				if (event.type === "done") return event.message;
				if (event.type === "error") return event.error;
				throw new Error("Unexpected assistant event");
			},
		);
		queueMicrotask(() => {
			if (message.stopReason === "error") {
				this.push({ type: "error", reason: "error", error: message });
				return;
			}
			this.push({ type: "done", reason: "stop", message });
		});
	}
}

function assistantMessage(stopReason: "stop" | "error", errorMessage?: string): AssistantMessage {
	return {
		role: "assistant",
		content: stopReason === "stop" ? [{ type: "text", text: "retry recovered" }] : [],
		api: "openai-responses",
		provider: "test",
		model: MODEL.id,
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason,
		errorMessage,
		timestamp: Date.now(),
	};
}
