// Copyright The Open Forge contributors.
import type { Api, Model } from "@vetta/ai";
import type { InitializationRollbackTask, RuntimeResourceContext } from "@vetta/runtime-core";
import type { RuntimeConfigurationSnapshotSource } from "@vetta/runtime-core/configuration";
import type { RuntimeToolResult } from "@vetta/runtime-core/kernel";
import type { McpRuntimeToolView } from "@vetta/runtime-mcp";
import type {
	BackgroundCommandService,
	CodingToolRegistration,
	RuntimeToolResultArtifactStore,
	RuntimeToolResultArtifactWriteRequest,
} from "@vetta/runtime-tools";
import { describe, expect, it } from "vitest";
import type { CodingAgentSessionExecutionEnvironment } from "../../src/composition/contracts/session-execution-environment.js";
import {
	type CodingAgentSessionPeripheralAssembly,
	createCodingAgentSessionPeripheralAssembly,
} from "../../src/composition/session-initialization/peripheral-assembly.js";
import { CodingAgentCompositionResourceRegistry } from "../../src/composition/session-lifecycle/resource-registry.js";
import type { CodingAgentMcpSessionCoordinator } from "../../src/composition/tool-surface/mcp-session-coordinator.js";
import { createCodingToolsRuntimeComposition } from "../../src/composition/tool-surface/runtime-tools-composition.js";
import { createCodingAgentCodingToolResultPolicy } from "../../src/tool-results/result-policy.js";

const SESSION_ID = "session-execution-result-policy";
const COMMAND_TOOL_NAME = process.platform === "win32" ? "shell" : "bash";

/**
 * 会话执行运行时（bash/read/write/edit/task_output/task_stop）必须与 Coding Tools
 * 共享同一结果策略实例；这些用例走产品真实装配（peripheral-assembly → session catalog）
 * 执行工具，验证 50KB+artifact 预算、图片准入内联与 64KB details 预算在会话内生效。
 */
describe("Coding Agent session execution tool result policy", () => {
	it("offloads a large bash output and keeps the full result as an artifact reference", async () => {
		const output = "y".repeat(120 * 1024);
		const fixture = await createPolicyFixture({
			tools: {
				[COMMAND_TOOL_NAME]: async () => ({ content: [{ type: "text", text: output }] }),
			},
		});
		try {
			const result = await executeSessionTool(fixture.assembly, COMMAND_TOOL_NAME);

			const text = firstText(result);
			expect(text).toContain("Tool result exceeds inline budget");
			expect(text).toContain("Full result: artifact-1.json");
			expect(Buffer.byteLength(text)).toBeLessThan(output.length);
			expect(fixture.artifactWrites).toHaveLength(1);
			const request = fixture.artifactWrites[0]!;
			expect(request.toolName).toBe(COMMAND_TOOL_NAME);
			expect(request.sessionId).toBe(SESSION_ID);
			expect(request.mediaType).toBe("application/json");
			expect(JSON.parse(request.data)).toEqual({ content: [{ type: "text", text: output }] });
		} finally {
			await fixture.dispose();
		}
	});

	it("offloads a large read result and preserves the full content in the artifact payload", async () => {
		const content = "0123456789\n".repeat(12 * 1024);
		const fixture = await createPolicyFixture({
			tools: {
				read: async () => ({ content: [{ type: "text", text: content }] }),
			},
		});
		try {
			const result = await executeSessionTool(fixture.assembly, "read");

			const text = firstText(result);
			expect(text).toContain("Tool result exceeds inline budget");
			expect(text).toContain("Full result: artifact-1.json");
			expect(text.startsWith("0123456789")).toBe(true);
			expect(fixture.artifactWrites).toHaveLength(1);
			expect(fixture.artifactWrites[0]?.toolName).toBe("read");
			expect(JSON.parse(fixture.artifactWrites[0]!.data)).toEqual({
				content: [{ type: "text", text: content }],
			});
		} finally {
			await fixture.dispose();
		}
	});

	it("keeps read screenshots inline within media admission and omits only over-admission images", async () => {
		// 1MB 截图在单项 8MB 准入内：超 50KB 触发投影也必须保留内联（截图预览的媒体引用链依赖持久化 content）。
		const admittedImage = imagePart(1024 * 1024);
		// 12M base64 字符 ≈ 9MB 解码，超过单项 8MB 准入上限，以与 MCP 同口径的省略文案替换。
		const overAdmissionImage = { type: "image" as const, data: "A".repeat(12_000_000), mimeType: "image/png" };
		const result: RuntimeToolResult = {
			content: [{ type: "text", text: "2 screenshots" }, admittedImage, overAdmissionImage],
		};
		const fixture = await createPolicyFixture({
			tools: { read: async () => result },
		});
		try {
			const projected = await executeSessionTool(fixture.assembly, "read");

			expect(projected.content).toContainEqual(admittedImage);
			expect(projected.content).toContainEqual({
				type: "text",
				text: "[image omitted: invalid encoding, unsafe MIME type, or host size limit]",
			});
			expect(fixture.artifactWrites).toHaveLength(1);
			expect(JSON.parse(fixture.artifactWrites[0]!.data)).toEqual({ content: result.content });
		} finally {
			await fixture.dispose();
		}
	});

	it("keeps edit diff details intact within the details budget while the result is projected", async () => {
		// details ≈ 56KB：content+details > 50KB 触发投影，但 ≤ 64KB details 预算内必须原样保留，
		// diff 展示不得回退为 offload 标记。
		const details = { diff: `@@ -1 +1 @@\n${"context\n".repeat(7 * 1024)}`, firstChangedLine: 12, appliedEdits: 1 };
		const fixture = await createPolicyFixture({
			tools: {
				edit: async () => ({
					content: [{ type: "text", text: "Successfully replaced text in app.ts." }],
					details,
				}),
			},
		});
		try {
			const result = await executeSessionTool(fixture.assembly, "edit");

			expect(result.details).toBe(details);
			expect(firstText(result)).toContain("Full result:");
			expect(fixture.artifactWrites).toHaveLength(1);
		} finally {
			await fixture.dispose();
		}
	});

	it("preserves the complete result when the host does not inject a result policy", async () => {
		const largeResult: RuntimeToolResult = { content: [{ type: "text", text: "z".repeat(120 * 1024) }] };
		const fixture = await createPolicyFixture({
			tools: { read: async () => largeResult },
			injectResultPolicy: false,
		});
		try {
			expect(await executeSessionTool(fixture.assembly, "read")).toBe(largeResult);
			expect(fixture.artifactWrites).toEqual([]);
		} finally {
			await fixture.dispose();
		}
	});

	it("propagates tool execution errors without invoking the result policy", async () => {
		const fixture = await createPolicyFixture({
			tools: {
				read: async () => {
					throw new Error("read failed");
				},
			},
		});
		try {
			await expect(executeSessionTool(fixture.assembly, "read")).rejects.toThrow("read failed");
			expect(fixture.artifactWrites).toEqual([]);
		} finally {
			await fixture.dispose();
		}
	});
});

interface PolicyFixture {
	readonly assembly: CodingAgentSessionPeripheralAssembly;
	readonly artifactWrites: RuntimeToolResultArtifactWriteRequest[];
	dispose(): Promise<void>;
}

async function createPolicyFixture(options: {
	readonly tools: Readonly<Record<string, () => Promise<RuntimeToolResult>>>;
	readonly injectResultPolicy?: boolean;
}): Promise<PolicyFixture> {
	const artifactWrites: RuntimeToolResultArtifactWriteRequest[] = [];
	const artifactStore: RuntimeToolResultArtifactStore = {
		async write(request) {
			artifactWrites.push(request);
			return { reference: `artifact-${artifactWrites.length}.json`, byteLength: request.byteLength };
		},
	};
	const rollbacks: InitializationRollbackTask[] = [];
	const activation = {
		mode: "explicit" as const,
		toolNames: [...Object.keys(options.tools), "task_output", "task_stop"],
	};
	const codingTools = createCodingToolsRuntimeComposition({
		cwd: "C:/workspace",
		environment: {
			// 与产品接线一致：共享 Registry 持有同名基础工具条目，供 resolveToolEntry 仲裁。
			registrations: Object.keys(options.tools).map((name) => stubRegistration(name)),
			backgroundService: createFakeBackgroundService(),
			dispose() {},
		},
		...(options.injectResultPolicy === false
			? {}
			: { resultPolicy: createCodingAgentCodingToolResultPolicy({ artifactStore }) }),
	});
	const environment: CodingAgentSessionExecutionEnvironment = {
		registrations: Object.entries(options.tools).map(([name, execute]) => ({
			tool: { name, label: name, description: name, inputSchema: { type: "object" }, execute },
		})),
		backgroundService: createFakeBackgroundService(),
		sandbox: { createToolSet: () => undefined },
		dispose() {},
	};
	const observations: unknown[] = [];
	const records: unknown[] = [];
	const resourceContext = {
		operation: "create",
		contextAppender: {
			append: (next: readonly unknown[]) => {
				records.push(...next);
			},
		},
		async deliverAsyncContext(next: readonly unknown[]) {
			records.push(...next);
		},
		abortCurrentRun() {},
		async reportObservation(observation: unknown) {
			observations.push(observation);
		},
	} as unknown as RuntimeResourceContext;
	try {
		const assembly = await createCodingAgentSessionPeripheralAssembly({
			profile: {
				createSessionExecutionEnvironment: async () => environment,
				initialModel: MODEL,
				initialThinkingLevel: "off",
			},
			sessionOptions: { sessionId: SESSION_ID },
			sessionCwd: "C:/workspace",
			scenario: "cli",
			activation,
			codingTools,
			indexes: new CodingAgentCompositionResourceRegistry().indexes,
			mcpCoordinator: createFakeMcpCoordinator(),
			resourceContext,
			configurationSource: fakeConfigurationSource,
			readSessionId: () => SESSION_ID,
			resolveActivation: () => activation,
			deferRollback: (task) => {
				rollbacks.push(task);
			},
		});
		return {
			assembly,
			artifactWrites,
			dispose: async () => {
				for (const task of [...rollbacks].reverse()) await task.rollback();
				codingTools.dispose();
			},
		};
	} catch (error) {
		codingTools.dispose();
		throw error;
	}
}

function executeSessionTool(
	assembly: CodingAgentSessionPeripheralAssembly,
	toolName: string,
): Promise<RuntimeToolResult> {
	const tool = assembly.executionRuntime.readAvailableTools().get(toolName);
	if (!tool) throw new Error(`session execution tool is not available: ${toolName}`);
	return tool.execute({
		sessionId: SESSION_ID,
		turnId: "turn-1",
		toolCallId: `call-${toolName}`,
		input: {},
		signal: new AbortController().signal,
	});
}

function firstText(result: RuntimeToolResult): string {
	const item = result.content[0];
	return item?.type === "text" ? item.text : "";
}

/** canonical base64（可通过 MCP 媒体准入的编码形态）。 */
function imagePart(bytes: number): { type: "image"; data: string; mimeType: string } {
	return { type: "image", data: Buffer.alloc(bytes, 65).toString("base64"), mimeType: "image/png" };
}

function stubRegistration(name: string): CodingToolRegistration {
	return {
		tool: {
			name,
			label: name,
			description: name,
			inputSchema: { type: "object" },
			execute: async () => ({ content: [{ type: "text", text: name }] }),
		},
	};
}

function createFakeBackgroundService(): BackgroundCommandService {
	return {
		spawn: () => {
			throw new Error("fake background service does not spawn commands");
		},
		subscribe: () => () => {},
		subscribeNotifications: () => () => {},
		wait: async () => {
			throw new Error("fake background service has no tasks");
		},
		get: () => undefined,
		list: () => [],
		clearFinished: () => 0,
		readOutput: () => "",
		stop: () => false,
		dispose: () => {},
		shutdown: async () => {},
	};
}

function createFakeMcpCoordinator(): CodingAgentMcpSessionCoordinator {
	const emptyView: McpRuntimeToolView = { tools: [] };
	return {
		sharedRuntimeAvailable: false,
		createSessionController: () => undefined,
		refreshSession: async () => undefined,
		readInheritedToolView: async () => emptyView,
		dispose: () => {},
	};
}

const fakeConfigurationSource: RuntimeConfigurationSnapshotSource = {
	acquire: () => ({
		snapshot: {
			id: "test-configuration",
			definitionVersion: 0,
			layers: [],
			entries: [],
			diagnostics: [],
			get: () => undefined,
			read: () => undefined,
		},
		release: async () => {},
	}),
};

const MODEL: Model<Api> = {
	id: "session-result-policy-model",
	name: "Session Result Policy Model",
	api: "openai-responses",
	provider: "test",
	baseUrl: "https://example.test",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8_000,
	maxTokens: 1_000,
};
