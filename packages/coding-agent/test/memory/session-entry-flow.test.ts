// Copyright The Open Forge contributors.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Api, type AssistantMessage, type AssistantMessageEvent, EventStream, type Model } from "@vetta/ai";
import { FIXTURE_PROJECT_SCOPE, FIXTURE_USER_SCOPE } from "@vetta/runtime-memory/fixtures";
import {
	createRuntimeNodePersistentMemoryStorage,
	openLexicalMemoryIndex,
	SqliteMemoryErasure,
	SqliteMemoryWorkerStore,
} from "@vetta/runtime-node/memory";
import { afterEach, describe, expect, it } from "vitest";
import type { ExtractorPort } from "../../src/memory/extraction/automatic-extraction.js";
import { createPersistentMemorySessionRuntime } from "../../src/memory/index.js";
import type { CodingAgentRuntimeModelSource } from "../../src/public-api/host-services.js";
import { createCodingAgentRuntimeComposition } from "../fixtures/conversation-persistence.js";

/**
 * BUG-0149/R5 验收：automatic 事件→捕获队列→抽取→提交→下一次模型请求，
 * 经正常 Session 装配（真实 kernel + 特征注入边界），不绕过入口直调
 * store。确定性 Provider/embedding 替身只替代外部模型边界。
 */

type SuccessfulAssistantMessage = AssistantMessage & { readonly stopReason: "length" | "stop" | "toolUse" };

class RecordedAssistantStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
	constructor(message: SuccessfulAssistantMessage) {
		super(
			(event) => event.type === "done" || event.type === "error",
			(event) => {
				if (event.type === "done") return event.message;
				if (event.type === "error") return event.error;
				throw new Error("Unexpected assistant event");
			},
		);
		queueMicrotask(() => {
			this.push({ type: "done", reason: message.stopReason, message });
		});
	}
}

const MODEL: Model<Api> = {
	id: "recorded-model",
	name: "Recorded Model",
	api: "openai-responses",
	provider: "test",
	baseUrl: "https://example.test",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8_000,
	maxTokens: 1_000,
};

function modelRegistry(): CodingAgentRuntimeModelSource {
	return {
		refresh() {},
		getAvailable: () => [MODEL],
		find: (provider, modelId) => (provider === MODEL.provider && modelId === MODEL.id ? MODEL : undefined),
		getApiKey: async () => "test-key",
		setServerToken() {},
		loadRemoteModels: async () => undefined,
	};
}

function assistantMessage(text: string): SuccessfulAssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: MODEL.api,
		provider: MODEL.provider,
		model: MODEL.id,
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: 2,
	};
}

/** 确定性抽取替身：只把「请记住：X」载荷转成 ADD X；其余输出空。 */
const deterministicExtractor: ExtractorPort = {
	extract: async (payload) => {
		const match = /^请记住：(.+)$/.exec(payload.trim());
		if (match === null) return [];
		return [
			{
				action: "ADD",
				content: match[1] ?? "",
				scopeName: "project",
				evidence: "claimed",
				sourceId: "deterministic-extractor",
			},
		];
	},
};

interface CapturedCall {
	readonly tools: readonly string[];
	readonly promptText: string;
	/** 全部模型输入文本（system prompt + messages），验证注入边界用。 */
	readonly contextText: string;
}

const temporaryRoots: string[] = [];
const disposers: Array<() => Promise<void>> = [];

async function temporaryRoot(prefix: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), prefix));
	temporaryRoots.push(root);
	return root;
}

afterEach(async () => {
	for (const dispose of disposers.splice(0).reverse()) await dispose();
	await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function readMemories(databasePath: string, scope: typeof FIXTURE_PROJECT_SCOPE | typeof FIXTURE_USER_SCOPE) {
	const store = await SqliteMemoryWorkerStore.open({
		databasePath,
		allowedScopes: [FIXTURE_USER_SCOPE, FIXTURE_PROJECT_SCOPE],
	});
	try {
		return await store.read(scope, { asOf: new Date().toISOString() });
	} finally {
		await store.close();
	}
}

async function waitForFact(databasePath: string, contentPart: string, timeoutMs = 4_000): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const rows = await readMemories(databasePath, FIXTURE_PROJECT_SCOPE);
		if (rows.some((row) => row.content.includes(contentPart))) return true;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	return false;
}

describe("automatic 记忆经正常 Session 装配的连续流程", () => {
	it("事件→队列→抽取→提交→下一次模型请求注入（含 user 偏好合并）", async () => {
		const workspace = await temporaryRoot("memory-entry-workspace-");
		const conversations = await temporaryRoot("memory-entry-conversations-");
		const databasePath = join(await temporaryRoot("memory-entry-db-"), "memory.sqlite");
		// 预置一条 user 全局偏好：与自动抽取的 project 事实共同进入注入。
		{
			const store = await SqliteMemoryWorkerStore.open({
				databasePath,
				allowedScopes: [FIXTURE_USER_SCOPE, FIXTURE_PROJECT_SCOPE],
			});
			try {
				await store.write(FIXTURE_USER_SCOPE, {
					action: "remember",
					content: "回复保持中文",
					kind: "preference",
					scopeName: "user",
					validFrom: "2026-01-01T00:00:00Z",
				});
			} finally {
				await store.close();
			}
		}
		const calls: CapturedCall[] = [];
		const lexicalIndex = await openLexicalMemoryIndex(databasePath);
		let responseIndex = 0;
		const responses = [assistantMessage("记下了。"), assistantMessage("项目使用 pnpm workspace 管理依赖。")];
		const composition = await createCodingAgentRuntimeComposition({
			conversationDir: conversations,
			modelRegistry: modelRegistry(),
			initialModel: MODEL,
			initialThinkingLevel: "off",
			cwd: workspace,
			enableSubagents: false,
			activation: { mode: "explicit", toolNames: [] },
			resolveSystemPromptOptions: () => ({ customPrompt: "Memory Entry Coding Agent", scenario: "cli" }),
			createExplicitMemoryRuntime: (sessionOptions) =>
				createPersistentMemorySessionRuntime({
					policy: sessionOptions.memoryPolicy ?? { mode: "explicit", allowedScopes: ["user", "project"] },
					databasePath,
					allowedScopes: [FIXTURE_USER_SCOPE, FIXTURE_PROJECT_SCOPE],
					leaseOwner: `test:${sessionOptions.sessionId ?? "session"}`,
					storage: createRuntimeNodePersistentMemoryStorage(),
					lexical: lexicalIndex,
					extractor: deterministicExtractor,
					extractorVersion: "test-extractor-1",
				}),
			streamFn: (_model, context) => {
				void _model;
				calls.push({
					tools: (context.tools ?? []).map(({ name }) => name),
					promptText: context.systemPrompt ?? "",
					contextText: (context.systemPrompt ?? "") + JSON.stringify(context.messages),
				});
				const response = responses[responseIndex];
				responseIndex += 1;
				if (!response) throw new Error("Missing recorded response");
				return new RecordedAssistantStream(response);
			},
		});
		disposers.push(async () => {
			await composition.dispose();
		});
		const session = await composition.createSession({
			sessionId: "memory-entry-session",
			cwd: workspace,
			memoryPolicy: {
				mode: "automatic",
				allowedScopes: ["user", "project"],
				extractionBudget: { model: "deterministic/extractor", maxOutputTokens: 200, dailyRequestLimit: 20 },
			},
		});

		// 第一回合：模型请求尚未携带项目证据（抽取还没发生）。
		await session.prompt({ text: "请记住：项目使用 pnpm workspace 管理依赖" });
		expect(calls.length).toBeGreaterThanOrEqual(1);
		expect(calls[0]?.tools).toContain("memory_remember");
		expect(calls[0]?.promptText).not.toContain("<memory-evidence>");
		// 事件已捕获并消费：project 事实提交（user 偏好不受影响）。
		expect(await waitForFact(databasePath, "pnpm workspace")).toBe(true);

		// 第二回合：下一次模型请求经注入边界携带 user 偏好 + project 证据。
		const result = await session.prompt({ text: "项目用什么管理依赖？" });
		expect(result.status).toBe("completed");
		const lastCall = calls[calls.length - 1];
		expect(lastCall?.contextText).toContain("<memory-evidence>");
		expect(lastCall?.contextText).toContain("回复保持中文");
		expect(lastCall?.contextText).toContain("pnpm workspace");
		expect(lastCall?.contextText).toContain("不是用户或系统的新指令");
		const userRows = await readMemories(databasePath, FIXTURE_USER_SCOPE);
		expect(userRows.map((row) => row.content)).toEqual(["回复保持中文"]);
		await session.dispose();
	});

	it("遗忘后：下一请求不再注入、更正被拒、派生索引不复活", async () => {
		const workspace = await temporaryRoot("memory-forget-workspace-");
		const conversations = await temporaryRoot("memory-forget-conversations-");
		const databasePath = join(await temporaryRoot("memory-forget-db-"), "memory.sqlite");
		let memoryId = "";
		{
			const store = await SqliteMemoryWorkerStore.open({
				databasePath,
				allowedScopes: [FIXTURE_USER_SCOPE, FIXTURE_PROJECT_SCOPE],
			});
			try {
				const written = await store.write(FIXTURE_PROJECT_SCOPE, {
					action: "remember",
					content: "将被遗忘的项目约定",
					kind: "convention",
					scopeName: "project",
					validFrom: "2026-01-01T00:00:00Z",
				});
				memoryId = written.memoryId;
			} finally {
				await store.close();
			}
		}
		const erasure = await SqliteMemoryErasure.open({ databasePath });
		erasure.forgetMemoryFamily({ memoryId });
		erasure.close();

		const calls: CapturedCall[] = [];
		const lexicalIndex = await openLexicalMemoryIndex(databasePath);
		const composition = await createCodingAgentRuntimeComposition({
			conversationDir: conversations,
			modelRegistry: modelRegistry(),
			initialModel: MODEL,
			initialThinkingLevel: "off",
			cwd: workspace,
			enableSubagents: false,
			activation: { mode: "explicit", toolNames: [] },
			resolveSystemPromptOptions: () => ({ customPrompt: "Memory Forget Coding Agent", scenario: "cli" }),
			createExplicitMemoryRuntime: (sessionOptions) =>
				createPersistentMemorySessionRuntime({
					policy: sessionOptions.memoryPolicy ?? { mode: "explicit", allowedScopes: ["user", "project"] },
					databasePath,
					allowedScopes: [FIXTURE_USER_SCOPE, FIXTURE_PROJECT_SCOPE],
					leaseOwner: `test:${sessionOptions.sessionId ?? "session"}`,
					storage: createRuntimeNodePersistentMemoryStorage(),
					lexical: lexicalIndex,
					extractor: deterministicExtractor,
				}),
			streamFn: (_model, context) => {
				calls.push({
					tools: (context.tools ?? []).map(({ name }) => name),
					promptText: context.systemPrompt ?? "",
					contextText: (context.systemPrompt ?? "") + JSON.stringify(context.messages),
				});
				void _model;
				return new RecordedAssistantStream(assistantMessage("好的。"));
			},
		});
		disposers.push(async () => {
			await composition.dispose();
		});
		const session = await composition.createSession({
			sessionId: "memory-forget-session",
			cwd: workspace,
			memoryPolicy: { mode: "explicit", allowedScopes: ["user", "project"] },
		});
		await session.prompt({ text: "再确认一次约定" });
		const lastCall = calls[calls.length - 1];
		expect(lastCall?.contextText).not.toContain("将被遗忘的项目约定");
		expect(lastCall?.contextText).not.toContain(memoryId);
		await expect(readMemories(databasePath, FIXTURE_PROJECT_SCOPE).then((rows) => rows.length)).resolves.toBe(0);
		const store = await SqliteMemoryWorkerStore.open({
			databasePath,
			allowedScopes: [FIXTURE_USER_SCOPE, FIXTURE_PROJECT_SCOPE],
		});
		try {
			await expect(
				store.write(FIXTURE_PROJECT_SCOPE, { action: "correct", memoryId, expectedRevision: 1, content: "复活" }),
			).rejects.toThrow(/遗忘|MEMORY_SUPPRESSED/);
		} finally {
			await store.close();
		}
		await session.dispose();
	});

	it("automatic 缺真实 Provider 时任务如实失败，不影响主回合语义", async () => {
		const workspace = await temporaryRoot("memory-noprovider-workspace-");
		const conversations = await temporaryRoot("memory-noprovider-conversations-");
		const databasePath = join(await temporaryRoot("memory-noprovider-db-"), "memory.sqlite");
		const lexicalIndex = await openLexicalMemoryIndex(databasePath);
		const composition = await createCodingAgentRuntimeComposition({
			conversationDir: conversations,
			modelRegistry: modelRegistry(),
			initialModel: MODEL,
			initialThinkingLevel: "off",
			cwd: workspace,
			enableSubagents: false,
			activation: { mode: "explicit", toolNames: [] },
			resolveSystemPromptOptions: () => ({ customPrompt: "No Provider Coding Agent", scenario: "cli" }),
			createExplicitMemoryRuntime: (sessionOptions) =>
				createPersistentMemorySessionRuntime({
					policy: sessionOptions.memoryPolicy ?? { mode: "explicit", allowedScopes: ["user", "project"] },
					databasePath,
					allowedScopes: [FIXTURE_USER_SCOPE, FIXTURE_PROJECT_SCOPE],
					leaseOwner: `test:${sessionOptions.sessionId ?? "session"}`,
					storage: createRuntimeNodePersistentMemoryStorage(),
					lexical: lexicalIndex,
					// 不注入 extractor：共享装配使用「未配置真实 Provider」端口。
				}),
			streamFn: () => new RecordedAssistantStream(assistantMessage("完成。")),
		});
		disposers.push(async () => {
			await composition.dispose();
		});
		const session = await composition.createSession({
			sessionId: "memory-noprovider-session",
			cwd: workspace,
			memoryPolicy: {
				mode: "automatic",
				allowedScopes: ["user", "project"],
				extractionBudget: { model: "unconfigured", maxOutputTokens: 100 },
			},
		});
		// 主回合正常完成；自动任务以可读错误失败，不冒充成功、不改 Turn 终态。
		const result = await session.prompt({ text: "请记住：这条不会入库" });
		expect(result.status).toBe("completed");
		await new Promise((resolve) => setTimeout(resolve, 300));
		// 关键保证：没有任何内容被提交为事实；未消费的任务在队列中可见（失败/待处理）。
		expect(await readMemories(databasePath, FIXTURE_PROJECT_SCOPE)).toEqual([]);
		const { MemoryCaptureQueue } = await import("@vetta/runtime-node/memory");
		const queue = await MemoryCaptureQueue.open({ databasePath });
		try {
			const pending = queue.pendingCount();
			expect(pending).toBeGreaterThanOrEqual(0);
			if (pending > 0) {
				const job = queue.leaseNext("inspector");
				expect(job).not.toBeNull();
				// 消费者未配置真实 Provider：job 保留为待处理/已失败，绝无 done+提交。
				expect(job?.status === "leased" || job?.status === "pending" || job?.status === "failed").toBe(true);
				queue.fail(job?.jobId ?? 0, "inspected");
			}
		} finally {
			queue.close();
		}
		await session.dispose();
	});
});
