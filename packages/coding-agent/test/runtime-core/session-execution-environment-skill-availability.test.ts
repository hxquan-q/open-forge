// Copyright The Open Forge contributors.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, Model } from "@vetta/ai";
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import { createNodeFileToolRegistrations } from "@vetta/runtime-node/coding";
import { afterEach, describe, expect, it } from "vitest";
import type {
	CodingAgentRuntimeComposition,
	CodingAgentSessionExecutionEnvironmentContext,
} from "../../src/composition/index.js";
import { createCodingAgentNodePathPolicy } from "../../src/host/tool-environment/node/node-path-policy.js";
import { createCodingAgentNodeSessionExecutionEnvironment } from "../../src/host/tool-environment/node/node-session-execution-environment.js";
import type { CodingAgentRuntimeModelSource } from "../../src/public-api/host-services.js";
import type { Skill } from "../../src/resources/skills/index.js";
import type { CodingAgentPromptResourceSource } from "../../src/runtime-contracts/index.js";
import { SettingsRuntime } from "../../src/settings/index.js";
import { createCodingAgentEditPathPolicy } from "../../src/tool-policy/path/edit-path-policy.js";
import { createCodingAgentWritePathPolicy } from "../../src/tool-policy/path/write-path-policy.js";
import { CODING_AGENT_READ_TOOL_OPTIONS } from "../../src/tool-policy/read-tool-policy.js";
import { createCodingAgentRuntimeComposition } from "../fixtures/conversation-persistence.js";

/** 一个最小的 `.xlsx`（ZIP 魔数）：只要 read 判定为二进制文档即可，内容不进上下文。 */
const WORKBOOK_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);

const compositions: CodingAgentRuntimeComposition[] = [];
const temporaryRoots: string[] = [];

afterEach(async () => {
	for (const composition of compositions.splice(0).reverse()) await composition.dispose();
	for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

/**
 * BUG-0026 回归：会话执行环境上下文此前没有「本会话可调用的技能名」这个字段，
 * 宿主的会话文件工具拿不到可用性，二进制读提示只能恒报「没有可用技能」。
 *
 * 这里装配一次真实会话：装配点必须把技能资源源的可用技能名填进会话执行环境上下文，
 * 宿主按既有做法展开该字段后，read 提示应当点名技能。
 */
describe("会话执行环境的技能可用性透传", () => {
	it("装配点把本会话可调用的技能名交给会话执行环境，read 提示据此点名技能", async () => {
		const workspace = await temporaryRoot("coding-agent-session-skill-availability-");
		const agentDir = join(workspace, "agent");
		const workbook = join(workspace, "book.xlsx");
		await writeFile(workbook, WORKBOOK_BYTES);
		const settings = SettingsRuntime.inMemory();
		const resourceSource = promptResourceSource([skill(join(workspace, "xlsx-skill"), "xlsx")]);

		const capturedContexts: CodingAgentSessionExecutionEnvironmentContext[] = [];
		const readTools: RuntimeToolDefinition[] = [];
		const composition = await createCodingAgentRuntimeComposition({
			cwd: workspace,
			agentDir,
			conversationDir: join(workspace, "conversations"),
			hookConfigLayers: [],
			enableSubagents: false,
			initialModel: MODEL,
			initialThinkingLevel: "off",
			activation: { mode: "explicit", toolNames: ["read"] },
			promptResourceSource: resourceSource,
			promptSettingsSource: settings,
			modelRegistry: modelRegistry(),
			createSessionExecutionEnvironment: (context) => {
				capturedContexts.push(context);
				const base = createCodingAgentNodeSessionExecutionEnvironment(context);
				// 宿主接线的形状：把上下文里的技能可用性展开给会话文件工具的 read 注册
				// （runtime-desktop 的三处站点与 coding-agent 的 node 工具环境都是这么写的）。
				const pathPolicy = createCodingAgentNodePathPolicy(context.cwd);
				const registrations = createNodeFileToolRegistrations({
					cwd: context.cwd,
					editPathPolicy: createCodingAgentEditPathPolicy(pathPolicy.boundaries),
					writePathPolicy: createCodingAgentWritePathPolicy(pathPolicy.boundaries),
					configurationSource: context.configurationSource,
					readOptions: { ...CODING_AGENT_READ_TOOL_OPTIONS, availableSkillNames: context.availableSkillNames },
				});
				const read = registrations.find(({ tool }) => tool.name === "read");
				if (!read) throw new Error("Expected the session file tools to register read");
				readTools.push(read.tool);
				return {
					registrations,
					backgroundService: base.backgroundService,
					sandbox: base.sandbox,
					dispose: () => base.dispose(),
				};
			},
		});
		compositions.push(composition);

		const session = await composition.createSession({
			sessionId: "session-skill-availability",
			cwd: workspace,
			includeAgentSkills: false,
		});
		try {
			expect(capturedContexts).toHaveLength(1);
			expect([...(capturedContexts[0]?.availableSkillNames?.() ?? [])]).toEqual(["xlsx"]);
			expect(await readBinaryHint(readTools[0], workbook)).toContain('"xlsx" skill');
		} finally {
			await session.dispose();
		}
	});
});

async function readBinaryHint(tool: RuntimeToolDefinition | undefined, path: string): Promise<string> {
	if (!tool) throw new Error("Expected the session file tools to register read");
	const result = await tool.execute({
		sessionId: "session-read-hint",
		turnId: "turn-read-hint",
		toolCallId: "call-read-hint",
		input: { path },
		signal: new AbortController().signal,
	});
	const text = result.content.find((item) => item.type === "text");
	return text?.type === "text" ? text.text : "";
}

async function temporaryRoot(prefix: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), prefix));
	temporaryRoots.push(root);
	await mkdir(join(root, ".git"), { recursive: true });
	return root;
}

function skill(baseDir: string, name: string): Skill {
	return {
		name,
		description: `${name} workflow`,
		filePath: join(baseDir, "SKILL.md"),
		baseDir,
		source: "test",
		type: "skill",
		disableModelInvocation: false,
		content: `---\nname: ${name}\ndescription: ${name} workflow\n---\nUse the ${name} workflow.\n`,
		sceneTasks: [],
	};
}

function promptResourceSource(skills: Skill[]): CodingAgentPromptResourceSource {
	return {
		getAgentsFiles: () => ({ agentsFiles: [] }),
		getAppendSystemPrompt: () => [],
		getSkills: () => ({ skills, diagnostics: [] }),
		getSystemPrompt: () => undefined,
		setRuntimeSkillPaths: async () => {},
		refreshContextResourcesIfChanged: async () => false,
		refreshSkillsIfChanged: async () => false,
	};
}

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
