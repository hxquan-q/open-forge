// Copyright The Open Forge contributors.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, Model } from "@vetta/ai";
import type {
	CodingAgentRuntimeComposition,
	CodingAgentSessionExecutionEnvironmentContext,
	CodingAgentToolEnvironmentContext,
} from "@vetta/coding-agent/composition";
import type { CodingAgentRuntimeModelSource } from "@vetta/coding-agent/host-services";
import type { Skill } from "@vetta/coding-agent/resources";
import { SettingsRuntime } from "@vetta/coding-agent/settings";
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createCliCodingAgentSessionExecutionEnvironmentFactory,
	createCliCodingAgentToolEnvironmentFactory,
} from "../src/rpc/runtime-host/cli-tool-environment.js";
import { createCodingAgentRuntimeComposition } from "./fixtures/runtime-composition.js";

/** 一个最小的 `.xlsx`（ZIP 魔数）：只要 read 判定为二进制文档即可，内容不进上下文。 */
const WORKBOOK_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);

const temporaryRoots: string[] = [];

/**
 * BUG-0027 回归：CLI 宿主的三处工具环境注册站点此前只传 `CODING_AGENT_READ_TOOL_OPTIONS`，
 * 没有把上下文里的技能可用性展开给读工具。于是即使会话里就装着能处理 `.xlsx` 的技能，
 * 二进制读提示也恒说「没有可用技能」，模型据此绕开已安装技能自己想办法转换。
 *
 * 三处站点各有一条用例：主工具环境、会话执行环境文件工具、会话执行环境沙箱工具集。
 * 修复前三条全部失败（提示不点名技能）。
 */
describe("CLI 工具环境的技能可用性透传", () => {
	let workspace: string;

	beforeEach(async () => {
		const home = await temporaryDirectory("cli-skill-availability-home-");
		vi.stubEnv("VETTA_HOME", home);
		vi.stubEnv("VETTA_CODING_AGENT_DIR", join(home, "agent"));
		vi.stubEnv("USERPROFILE", home);
		workspace = await temporaryDirectory("cli-skill-availability-workspace-");
		await writeFile(join(workspace, "book.xlsx"), WORKBOOK_BYTES);
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		for (const root of temporaryRoots.splice(0).reverse()) await rm(root, { recursive: true, force: true });
	});

	it("主工具环境的 read 注册点名本会话可调用的技能", async () => {
		const environment = await createCliCodingAgentToolEnvironmentFactory({
			agentDir: join(workspace, "agent"),
			settings: SettingsRuntime.inMemory(),
		})(toolEnvironmentContext(workspace, ["xlsx"]));
		try {
			expect(await readBinaryHint(findRead(environment.registrations), join(workspace, "book.xlsx"))).toContain(
				'"xlsx" skill',
			);
		} finally {
			await environment.dispose();
		}
	});

	it("会话执行环境的会话文件工具 read 注册点名技能", async () => {
		const environment = await createCliCodingAgentSessionExecutionEnvironmentFactory({
			agentDir: join(workspace, "agent"),
			settings: SettingsRuntime.inMemory(),
		})(sessionExecutionContext(workspace, ["xlsx"]));
		try {
			expect(await readBinaryHint(findRead(environment.registrations), join(workspace, "book.xlsx"))).toContain(
				'"xlsx" skill',
			);
		} finally {
			await environment.dispose();
		}
	});

	it("会话执行环境的沙箱工具集 read 注册点名技能", async () => {
		const environment = await createCliCodingAgentSessionExecutionEnvironmentFactory({
			agentDir: join(workspace, "agent"),
			settings: SettingsRuntime.inMemory(),
		})(sessionExecutionContext(workspace, ["xlsx"]));
		try {
			const toolSet = environment.sandbox.createToolSet({
				// 沙箱实现按平台选二进制。这里只构造注册、不执行任何命令，给出本平台确实存在的
				// 路径即可让三种平台都建得出工具集；断言的是 read 的提示，与沙箱能否真跑无关。
				windowsSandboxHostPath: process.execPath,
				linuxBubblewrapPath: "/bin/true",
				macosSandboxExecPath: "/usr/bin/sandbox-exec",
			});
			if (!toolSet) throw new Error("Expected a sandbox tool set on a supported platform");
			expect(await readBinaryHint(toolSet.read.tool, join(workspace, "book.xlsx"))).toContain('"xlsx" skill');
		} finally {
			await environment.dispose();
		}
	});

	it("技能不可用时提示保持「没有可用技能」，不指名任何技能", async () => {
		const environment = await createCliCodingAgentToolEnvironmentFactory({
			agentDir: join(workspace, "agent"),
			settings: SettingsRuntime.inMemory(),
		})(toolEnvironmentContext(workspace, []));
		try {
			const hint = await readBinaryHint(findRead(environment.registrations), join(workspace, "book.xlsx"));
			expect(hint).toContain("No installed skill can handle this format");
			expect(hint).not.toContain('"xlsx" skill');
		} finally {
			await environment.dispose();
		}
	});

	/**
	 * 站点上游确实有来源：CLI 走的是共享装配（`promptResourceSource` 即 CLI 的
	 * `bootstrap.resourceLoader`），工具环境上下文与会话执行环境上下文都会拿到同一份
	 * 技能可用性 provider。这条用例锁住「来源在 CLI 侧存在」，避免三个站点被改成
	 * 各自造技能名或从无关处取值。
	 */
	it("CLI 装配把本会话可调用的技能名交给工具环境与会话执行环境上下文", async () => {
		const agentDir = join(workspace, "agent");
		const settings = SettingsRuntime.inMemory();
		const createToolEnvironment = createCliCodingAgentToolEnvironmentFactory({ agentDir, settings });
		const createSessionExecutionEnvironment = createCliCodingAgentSessionExecutionEnvironmentFactory({
			agentDir,
			settings,
		});
		const toolContexts: CodingAgentToolEnvironmentContext[] = [];
		const sessionContexts: CodingAgentSessionExecutionEnvironmentContext[] = [];
		const compositions: CodingAgentRuntimeComposition[] = [];
		const composition = await createCodingAgentRuntimeComposition({
			conversationDir: join(workspace, "conversations"),
			cwd: workspace,
			agentDir,
			modelRegistry: modelRegistry(),
			initialModel: MODEL,
			initialThinkingLevel: "off",
			hookConfigLayers: [],
			enableSubagents: false,
			activation: { mode: "explicit", toolNames: ["read"] },
			promptResourceSource: promptResourceSource([skill(join(workspace, "xlsx-skill"), "xlsx")]),
			promptSettingsSource: settings,
			createToolEnvironment: (context) => {
				toolContexts.push(context);
				return createToolEnvironment(context);
			},
			createSessionExecutionEnvironment: (context) => {
				sessionContexts.push(context);
				return createSessionExecutionEnvironment(context);
			},
		});
		compositions.push(composition);
		const session = await composition.createSession({
			sessionId: "session-skill-availability",
			cwd: workspace,
			includeAgentSkills: false,
		});
		try {
			expect(toolContexts.length).toBeGreaterThan(0);
			expect([...(toolContexts[0]?.availableSkillNames?.() ?? [])]).toEqual(["xlsx"]);
			expect(sessionContexts.length).toBeGreaterThan(0);
			expect([...(sessionContexts[0]?.availableSkillNames?.() ?? [])]).toEqual(["xlsx"]);
		} finally {
			await session.dispose();
			for (const active of compositions.splice(0).reverse()) await active.dispose();
		}
	});
});

function toolEnvironmentContext(cwd: string, skillNames: readonly string[]): CodingAgentToolEnvironmentContext {
	return { cwd, scenario: "cli", availableSkillNames: () => new Set(skillNames) };
}

function sessionExecutionContext(
	cwd: string,
	skillNames: readonly string[],
): CodingAgentSessionExecutionEnvironmentContext {
	return {
		sessionId: "session-skill-availability",
		cwd,
		agentDir: join(cwd, "agent"),
		scenario: "cli",
		availableSkillNames: () => new Set(skillNames),
	};
}

function findRead(registrations: readonly { readonly tool: RuntimeToolDefinition }[]): RuntimeToolDefinition {
	const read = registrations.find(({ tool }) => tool.name === "read");
	if (!read) throw new Error("Expected the tool environment to register read");
	return read.tool;
}

async function readBinaryHint(tool: RuntimeToolDefinition, path: string): Promise<string> {
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

async function temporaryDirectory(prefix: string): Promise<string> {
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

function promptResourceSource(skills: Skill[]) {
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
