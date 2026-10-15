import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, Model } from "@vetta/ai";
import { RuntimeAgentRuntime } from "@vetta/runtime-core";
import type { RuntimeSnapshotLease, RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import { resolveModelCallFrame } from "@vetta/runtime-core/kernel";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { publishCodingAgentExecutionRuntimeDefinition } from "../../src/composition/index.js";
import type { Skill } from "../../src/resources/skills/index.js";
import type { CodingAgentPromptResourceSource } from "../../src/runtime-contracts/prompt-runtime.js";
import { createCodingAgentRuntimeComposition } from "../fixtures/conversation-persistence.js";
import { createFileSettingsRuntime } from "../fixtures/file-settings-runtime.js";

/**
 * BUG-0014 回归：选项目后首次创建会话以 AGENT_CONFIGURATION_RESOURCE_UNAVAILABLE 失败。
 *
 * Desktop 的新会话默认走 work 能力 Profile，`applyAgentProfileDefaults` 把 Profile 默认
 * 工具清单折算成显式 `overrides.tools`；其中部分名字（如 `memory` 需要显式开启
 * memoryMode、`im_send_attachment` 只有 RPC host-bridge 注册）在 Desktop 会话里根本
 * 没有注册。准入校验把这份清单当硬性白名单对可用目录逐名核对，任何缺名都会让整个
 * `session.create` 失败。按 ADR-0128，Profile 默认是「开箱默认」而非硬边界：
 * 宿主没提供的默认项应按软默认降级，创建照常成功；宿主确实没提供的名字也不得
 * 重新出现在模型工具面上。
 */
describe("profile default tools degrade instead of failing session create", () => {
	let directory: string;
	let runtime: RuntimeAgentRuntime;
	let composition: Awaited<ReturnType<typeof createCodingAgentRuntimeComposition>>;
	const leases: RuntimeSnapshotLease[] = [];
	beforeEach(async () => {
		directory = await mkdtemp(join(tmpdir(), "profile-default-create-"));
		await writeFile(join(directory, ".git"), "");
		runtime = new RuntimeAgentRuntime();
		publishCodingAgentExecutionRuntimeDefinition(runtime);
		const skills = [skill("alpha")];
		const resourceSource: CodingAgentPromptResourceSource = {
			getSkills: () => ({ skills, diagnostics: [] }),
			getAgentsFiles: () => ({ agentsFiles: [] }),
			getSystemPrompt: () => undefined,
			getAppendSystemPrompt: () => [],
			refreshSkillsIfChanged: async () => false,
			refreshContextResourcesIfChanged: async () => false,
			setRuntimeSkillPaths: async () => {},
		};
		composition = await createCodingAgentRuntimeComposition({
			cwd: directory,
			agentDir: join(directory, "agent"),
			conversationDir: join(directory, "conversations"),
			hookConfigLayers: [],
			enableSubagents: false,
			agentRuntime: { runtime },
			initialModel: MODEL,
			initialThinkingLevel: "off",
			activation: { mode: "explicit", toolNames: ["read", "write", "invoke_skill"] },
			modelRegistry: {
				refresh() {},
				getAvailable: () => [MODEL],
				find: () => MODEL,
				getApiKey: async () => "test-key",
				setServerToken() {},
				loadRemoteModels: async () => undefined,
			},
			resolveSystemPromptOptions: () => ({ customPrompt: "host base", skills }),
			createPromptRuntimeSources: async () => ({
				resourceSource,
				settingsSource: createFileSettingsRuntime(directory, join(directory, "agent")),
			}),
			mcpSource: {
				refresh: async () => ({
					tools: [{ tool: tool("mcp-one"), fingerprint: "one", serverName: "one" }],
				}),
			},
		});
	});
	afterEach(async () => {
		for (const lease of leases.splice(0)) await lease.release();
		await composition?.dispose();
		await runtime?.close();
		if (directory) await rm(directory, { recursive: true, force: true });
	});

	it("宿主未提供 Profile 默认工具时，首条消息前的会话创建照常成功且默认项降级", async () => {
		// Desktop work 会话的折算形状：可用工具之外还带着本宿主没注册的默认项。
		await composition.createSession({
			sessionId: "session",
			agentConfiguration: {
				template: null,
				overrides: { tools: ["read", "write", "invoke_skill", "memory", "im_send_attachment"] },
			},
			profileDefaultToolNames: ["memory", "im_send_attachment"],
		});
		const frame = await turnFrame("first-turn");
		// 软默认降级：缺省项不得借机回到模型工具面。
		expect([...frame.tools.keys()]).not.toContain("memory");
		expect([...frame.tools.keys()]).not.toContain("im_send_attachment");
		expect(frame.tools.has("invoke_skill")).toBe(true);
	});

	it("显式引用宿主不可用的工具仍在会话创建时以可恢复错误拒绝", async () => {
		await expect(
			composition.createSession({
				sessionId: "session",
				agentConfiguration: {
					template: null,
					overrides: { tools: ["read", "im_send_attachment"] },
				},
			}),
		).rejects.toThrow("AGENT_CONFIGURATION_RESOURCE_UNAVAILABLE");
	});

	async function turnFrame(operationId: string) {
		const lease = await runtime
			.requireSession("session")
			.acquire({ sessionId: "session", operationId, reason: "turn", signal: new AbortController().signal });
		leases.push(lease);
		return resolveModelCallFrame(lease.snapshot, {
			sessionId: "session",
			turnId: operationId,
			signal: new AbortController().signal,
			modelBinding: lease.modelBinding,
		});
	}
});

function tool(name: string): RuntimeToolDefinition {
	return { name, label: name, description: name, inputSchema: {}, execute: async () => ({ content: [] }) };
}

function skill(name: string): Skill {
	return {
		name,
		description: name,
		filePath: `/virtual/${name}/SKILL.md`,
		baseDir: `/virtual/${name}`,
		source: "test",
		type: "skill",
		disableModelInvocation: false,
		content: `---\nname: ${name}\ndescription: ${name}\n---\n${name}-body`,
		sceneTasks: [],
	};
}
const MODEL: Model<Api> = {
	id: "first",
	name: "First",
	provider: "test",
	api: "openai-responses",
	baseUrl: "https://example.test",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8000,
	maxTokens: 1000,
};
