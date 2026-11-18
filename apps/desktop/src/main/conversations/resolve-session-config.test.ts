// Modified by The Open Forge contributors.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseCodingAgentRuntimeSessionConfiguration } from "@vetta/coding-agent/composition";
import type { CodingAgentRuntimeToolRegistration } from "@vetta/coding-agent/runtime";
import { resolveCodeProjectAiWorkspace } from "@vetta/runtime-desktop";
import { afterEach, describe, expect, it, vi } from "vitest";

/** 可变的 desktop-config 桩：模拟用户在新会话页改「默认工作模式」。 */
const desktopConfig: { defaultAgentMode: "work" | "coding"; defaultExecutionMode: string; experimental: object } = {
	defaultAgentMode: "work",
	defaultExecutionMode: "full-access",
	experimental: {},
};

vi.mock("../logger.js", () => ({
	getAppLogger: () => ({
		debug: () => undefined,
		error: () => undefined,
		info: () => undefined,
		warn: () => undefined,
	}),
}));

vi.mock("../ipc/fs.js", async () => {
	// BUG-0192：allowProjectRoot 换真实实现，让会话解析真正注册 filesystem-service 的
	// 授权根，供边界断言消费；readDesktopConfig 保持桩，默认档位由测试控制。
	const { allowProjectRoot } = await import("../filesystem/filesystem-service.js");
	return {
		allowProjectRoot,
		readDesktopConfig: async () => desktopConfig,
	};
});

vi.mock("../plugins/plugin-catalog.js", () => ({
	pluginAgentContributionService: {
		buildRuntimeConfig: () => undefined,
	},
}));

import { assertFilesystemPathWithinProject, readEditableTextFile } from "../filesystem/filesystem-service.js";
import { resolveDesktopSessionConfig } from "./resolve-session-config.js";
import { recordSessionAgentMode } from "./session-agent-mode-store.js";

const temporaryRoots: string[] = [];

async function createTemporaryRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "vetta-capability-profile-"));
	temporaryRoots.push(root);
	return root;
}

/** 造一个可被 resolveDesktopSessionConfig 当作「已存在会话」恢复的会话文件。 */
async function createSessionFile(root: string, name: string): Promise<string> {
	const sessionPath = join(root, name);
	await writeFile(sessionPath, `${JSON.stringify({ type: "session", cwd: root })}\n`, "utf8");
	return sessionPath;
}

/** 会话配置里最终生效的工具默认集合：coding 缺省不设子集，work 折算成显式清单。 */
function resolvedDefaultToolNames(resolved: Awaited<ReturnType<typeof resolveDesktopSessionConfig>>) {
	return parseCodingAgentRuntimeSessionConfiguration(resolved.config.agent?.sessionConfiguration).agentConfiguration
		?.overrides.tools;
}

afterEach(async () => {
	desktopConfig.defaultAgentMode = "work";
	await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("能力 Profile 固化（TASK-0078）", () => {
	it("重开 coding 会话仍是 coding 工具面，不跟随当前办公默认值", async () => {
		const root = await createTemporaryRoot();
		const created = await resolveDesktopSessionConfig(
			{ cwd: root, agentMode: "coding", capabilityProfile: "coding" },
			"conversation",
			"interactive",
		);
		expect(created.capabilityProfile).toBe("coding");
		const sessionPath = await createSessionFile(root, "coding.jsonl");
		await recordSessionAgentMode(sessionPath, created.agentMode);

		// 用户已把页头切到办公；恢复请求按 TASK-0078 后的渲染层不再携带派生 axes。
		desktopConfig.defaultAgentMode = "work";
		const resumed = await resolveDesktopSessionConfig({ cwd: root, sessionPath }, "conversation", "interactive");
		expect(resumed.capabilityProfile).toBe("coding");
		expect(resumed.agentMode).toBe("coding");
		expect(resolvedDefaultToolNames(resumed)).toBeUndefined();
	});

	it("恢复会话忽略请求里按当前页头重派生的 Profile，固化记录优先", async () => {
		const root = await createTemporaryRoot();
		const created = await resolveDesktopSessionConfig(
			{ cwd: root, agentMode: "coding", capabilityProfile: "coding" },
			"conversation",
			"interactive",
		);
		const sessionPath = await createSessionFile(root, "pinned-coding.jsonl");
		await recordSessionAgentMode(sessionPath, created.agentMode);

		// 旧渲染层缺陷的形状：把「当前页头」派生的 work 随 resume 下发，也不得改写固化面。
		const resumed = await resolveDesktopSessionConfig(
			{ cwd: root, sessionPath, capabilityProfile: "work" },
			"conversation",
			"interactive",
		);
		expect(resumed.capabilityProfile).toBe("coding");
		expect(resumed.agentMode).toBe("coding");
		expect(resolvedDefaultToolNames(resumed)).toBeUndefined();
	});

	it("固化 work 的会话重开仍是 work 工具子集，恢复请求不能放宽", async () => {
		const root = await createTemporaryRoot();
		const created = await resolveDesktopSessionConfig(
			{ cwd: root, agentMode: "work", capabilityProfile: "work" },
			"conversation",
			"interactive",
		);
		const sessionPath = await createSessionFile(root, "pinned-work.jsonl");
		await recordSessionAgentMode(sessionPath, created.agentMode);

		const resumed = await resolveDesktopSessionConfig(
			{ cwd: root, sessionPath, capabilityProfile: "coding" },
			"conversation",
			"interactive",
		);
		expect(resumed.capabilityProfile).toBe("work");
		const tools = resolvedDefaultToolNames(resumed);
		expect(Array.isArray(tools)).toBe(true);
		expect(tools).not.toContain("bash");
	});

	it("未传 capabilityProfile 的新会话回落 coding 缺省，办公默认值不再连带收窄工具面", async () => {
		const root = await createTemporaryRoot();
		const resolved = await resolveDesktopSessionConfig({ cwd: root }, "conversation", "interactive");
		expect(resolved.capabilityProfile).toBe("coding");
		expect(resolved.agentMode).toBe("work");
		expect(resolvedDefaultToolNames(resolved)).toBeUndefined();
	});

	it("无固化记录的历史会话按 coding 恢复，不因 LEGACY 办公回落被收窄", async () => {
		const root = await createTemporaryRoot();
		const sessionPath = await createSessionFile(root, "legacy.jsonl");

		const resumed = await resolveDesktopSessionConfig({ cwd: root, sessionPath }, "conversation", "interactive");
		expect(resumed.agentMode).toBe("work");
		expect(resumed.capabilityProfile).toBe("coding");
		expect(resolvedDefaultToolNames(resumed)).toBeUndefined();
	});

	it("新建会话显式 work 仍应用办公工具子集", async () => {
		const root = await createTemporaryRoot();
		const created = await resolveDesktopSessionConfig(
			{ cwd: root, agentMode: "work", capabilityProfile: "work" },
			"conversation",
			"interactive",
		);
		expect(created.capabilityProfile).toBe("work");
		const tools = resolvedDefaultToolNames(created);
		expect(Array.isArray(tools)).toBe(true);
		expect(tools).not.toContain("bash");
	});
});

describe("恢复链 agentMode 回落次序（BUG-0187）", () => {
	it("恢复无固化记录的会话采纳显式请求的 agentMode（团队 Runtime 契约）", async () => {
		const root = await createTemporaryRoot();
		const sessionPath = await createSessionFile(root, "team-member.jsonl");
		// 团队会话绕过 desktop-conversation-service 创建，agent-modes.json 永无记录；
		// 恢复请求必须靠显式声明把档位钉回 coding，而不是回落 LEGACY 的 work。
		const resumed = await resolveDesktopSessionConfig(
			{ cwd: root, sessionPath, agentMode: "coding", capabilityProfile: "coding" },
			"other",
			"interactive",
		);
		expect(resumed.agentMode).toBe("coding");
		expect(resumed.capabilityProfile).toBe("coding");
	});

	it("恢复有固化记录的会话仍忽略请求 agentMode，记录优先", async () => {
		const root = await createTemporaryRoot();
		const sessionPath = await createSessionFile(root, "pinned-work.jsonl");
		await recordSessionAgentMode(sessionPath, "work");

		const resumed = await resolveDesktopSessionConfig(
			{ cwd: root, sessionPath, agentMode: "coding", capabilityProfile: "coding" },
			"conversation",
			"interactive",
		);
		expect(resumed.agentMode).toBe("work");
	});

	it("普通会话恢复不携带 agentMode 时仍回落 LEGACY 的 work", async () => {
		const root = await createTemporaryRoot();
		const sessionPath = await createSessionFile(root, "legacy.jsonl");

		const resumed = await resolveDesktopSessionConfig({ cwd: root, sessionPath }, "conversation", "interactive");
		expect(resumed.agentMode).toBe("work");
	});
});

describe("Profile 默认工具清单随会话下发（BUG-0014）", () => {
	it("折算 work 默认工具时把同一清单作为软默认证据随会话下发", async () => {
		const root = await createTemporaryRoot();
		const resolved = await resolveDesktopSessionConfig(
			{ cwd: root, agentMode: "work", capabilityProfile: "work" },
			"conversation",
			"interactive",
		);
		const sessionConfiguration = parseCodingAgentRuntimeSessionConfiguration(
			resolved.config.agent?.sessionConfiguration,
		);
		const tools = sessionConfiguration.agentConfiguration?.overrides.tools;
		expect(Array.isArray(tools)).toBe(true);
		expect(sessionConfiguration.profileDefaultToolNames).toEqual(tools);
	});

	it("显式工具选择优先时不下发软默认清单", async () => {
		const root = await createTemporaryRoot();
		const explicit = await resolveDesktopSessionConfig(
			{
				cwd: root,
				capabilityProfile: "work",
				agentConfiguration: { template: null, overrides: { tools: ["read"] } },
			},
			"conversation",
			"interactive",
		);
		expect(
			parseCodingAgentRuntimeSessionConfiguration(explicit.config.agent?.sessionConfiguration)
				.profileDefaultToolNames,
		).toBeUndefined();
	});

	it("coding 缺省不设工具子集，也不下发软默认清单", async () => {
		const root = await createTemporaryRoot();
		const resolved = await resolveDesktopSessionConfig(
			{ cwd: root, agentMode: "coding", capabilityProfile: "coding" },
			"conversation",
			"interactive",
		);
		const sessionConfiguration = parseCodingAgentRuntimeSessionConfiguration(
			resolved.config.agent?.sessionConfiguration,
		);
		expect(sessionConfiguration.agentConfiguration?.overrides.tools).toBeUndefined();
		expect(sessionConfiguration.profileDefaultToolNames).toBeUndefined();
	});
});

describe("会话注入工具（TASK-0095）", () => {
	const markerTool: CodingAgentRuntimeToolRegistration = {
		tool: {
			name: "marker_tool",
			label: "marker",
			description: "marker",
			inputSchema: { type: "object", properties: {} },
			async execute() {
				return { content: [] };
			},
		},
		scopeUse: ["conversation"],
		category: "agent-control",
	};

	it("工厂收到按生效 cwd 归一的项目根，产出并入 sessionRuntimeTools", async () => {
		const root = await createTemporaryRoot();
		let receivedScope: string | undefined;
		const resolved = await resolveDesktopSessionConfig({ cwd: root }, "conversation", "interactive", {
			createSessionRuntimeTools: (projectCwd) => {
				receivedScope = projectCwd;
				return [markerTool];
			},
		});
		expect(receivedScope).toBe(resolve(root));
		const sessionConfiguration = resolved.config.agent?.sessionConfiguration as
			| { sessionRuntimeTools?: readonly unknown[] }
			| undefined;
		expect(sessionConfiguration?.sessionRuntimeTools).toHaveLength(1);
	});

	it("恢复会话按头部 cwd 固化作用域，不跟随前台 cwd", async () => {
		const root = await createTemporaryRoot();
		const sessionPath = await createSessionFile(root, "scoped.jsonl");
		const other = await createTemporaryRoot();
		let receivedScope: string | undefined;
		await resolveDesktopSessionConfig({ cwd: other, sessionPath }, "conversation", "interactive", {
			createSessionRuntimeTools: (projectCwd) => {
				receivedScope = projectCwd;
				return [];
			},
		});
		expect(receivedScope).toBe(resolve(root));
	});

	it("未提供工厂时不注入，显式 sessionRuntimeTools 原样透传", async () => {
		const root = await createTemporaryRoot();
		const resolved = await resolveDesktopSessionConfig(
			{ cwd: root, sessionRuntimeTools: [markerTool] },
			"conversation",
			"interactive",
		);
		const sessionConfiguration = resolved.config.agent?.sessionConfiguration as
			| { sessionRuntimeTools?: readonly unknown[] }
			| undefined;
		expect(sessionConfiguration?.sessionRuntimeTools).toHaveLength(1);
	});
});

describe("Code 项目 AI 工作区会话上下文（TASK-0479）", () => {
	it("只为 coding 会话注入宿主解析的项目身份、AI 工作区路径和落点规则", async () => {
		const root = await createTemporaryRoot();
		const coding = await resolveDesktopSessionConfig(
			{ cwd: root, agentMode: "coding", capabilityProfile: "coding" },
			"conversation",
			"interactive",
		);
		const codingOptions = parseCodingAgentRuntimeSessionConfiguration(coding.config.agent?.sessionConfiguration);
		expect(codingOptions.projectIdentity).toBe(resolve(root));
		expect(codingOptions.projectAiWorkspaceRoot).toContain("workspace");
		expect(codingOptions.projectAiWorkspaceToolRoot).toBe(codingOptions.projectAiWorkspaceRoot);
		expect(codingOptions.systemPromptVolatileAddon).toContain("project-config.md");
		expect(codingOptions.systemPromptVolatileAddon).toContain("Keep source, tests");

		const sameProjectMember = await resolveDesktopSessionConfig(
			{ cwd: root, agentMode: "coding", capabilityProfile: "coding" },
			"conversation",
			"interactive",
		);
		const memberOptions = parseCodingAgentRuntimeSessionConfiguration(
			sameProjectMember.config.agent?.sessionConfiguration,
		);
		expect(memberOptions.projectAiWorkspaceRoot).toBe(codingOptions.projectAiWorkspaceRoot);

		const work = await resolveDesktopSessionConfig(
			{ cwd: root, agentMode: "work", capabilityProfile: "work" },
			"conversation",
			"interactive",
		);
		const workOptions = parseCodingAgentRuntimeSessionConfiguration(work.config.agent?.sessionConfiguration);
		expect(workOptions.projectIdentity).toBeUndefined();
		expect(workOptions.projectAiWorkspaceRoot).toBeUndefined();
	});
});

describe("AI 工作区 fs 授权（BUG-0192）", () => {
	// allowedRoots 是 filesystem-service 的模块级全局状态且无清理接口：正向用例各自用
	// 全新临时项目根（唯一 hash 工作区），负向用例只断言从未注册过的独立目录，用例间
	// 不依赖清理顺序。
	it("coding 会话解析后其 AI 工作区文件通过可编辑文本读取边界", async () => {
		const root = await createTemporaryRoot();
		const coding = await resolveDesktopSessionConfig(
			{ cwd: root, agentMode: "coding", capabilityProfile: "coding" },
			"conversation",
			"interactive",
		);
		const workspaceDir = parseCodingAgentRuntimeSessionConfiguration(
			coding.config.agent?.sessionConfiguration,
		).projectAiWorkspaceRoot;
		if (typeof workspaceDir !== "string") throw new Error("coding session should expose projectAiWorkspaceRoot");
		const workspaceFile = join(workspaceDir, "pipeline", "2026-11-18-form", "requirements.md");
		await mkdir(dirname(workspaceFile), { recursive: true });
		await writeFile(workspaceFile, "# 清场原始记录表\n", "utf8");
		// 旧实现：AI 工作区从未注册进 allowedRoots，此处抛
		// "Path is outside any known project directory"，右栏预览报「无法读取此文件」。
		const snapshot = await readEditableTextFile(workspaceFile);
		expect(snapshot.content).toBe("# 清场原始记录表\n");
	});

	it("恢复链首个解析（header cwd 重算）同样注册工作区", async () => {
		// 会话重启恢复/历史会话重开：resolveDesktopSessionConfig 读 sessionPath
		// header cwd 重算 projectAiWorkspace；本用例让恢复成为该项目的第一次解析，
		// 证明注册不依赖「先新建过」。
		const root = await createTemporaryRoot();
		const sessionPath = await createSessionFile(root, "bug-0192-resume.jsonl");
		await recordSessionAgentMode(sessionPath, "coding");
		const resumed = await resolveDesktopSessionConfig({ cwd: root, sessionPath }, "conversation", "interactive");
		expect(resumed.agentMode).toBe("coding");
		const workspaceDir = parseCodingAgentRuntimeSessionConfiguration(
			resumed.config.agent?.sessionConfiguration,
		).projectAiWorkspaceRoot;
		if (typeof workspaceDir !== "string")
			throw new Error("resumed coding session should expose projectAiWorkspaceRoot");
		const workspaceFile = join(workspaceDir, "pipeline", "notes.md");
		await mkdir(dirname(workspaceFile), { recursive: true });
		await writeFile(workspaceFile, "resume\n", "utf8");
		const snapshot = await readEditableTextFile(workspaceFile);
		expect(snapshot.content).toBe("resume\n");
	});

	it("work 档会话不注册 AI 工作区，工作区路径仍被边界拒绝", async () => {
		const root = await createTemporaryRoot();
		await resolveDesktopSessionConfig(
			{ cwd: root, agentMode: "work", capabilityProfile: "work" },
			"conversation",
			"interactive",
		);
		const workspaceFile = join(resolveCodeProjectAiWorkspace(resolve(root)).directory, "pipeline", "notes.md");
		expect(() => assertFilesystemPathWithinProject(workspaceFile)).toThrowError(
			"Path is outside any known project directory",
		);
	});

	it("边界不回归：他项目工作区 hash 目录与无关目录仍被拒绝", async () => {
		const root = await createTemporaryRoot();
		await resolveDesktopSessionConfig(
			{ cwd: root, agentMode: "coding", capabilityProfile: "coding" },
			"conversation",
			"interactive",
		);
		// 伪造他项目工作区：同一 code-projects 父目录下的另一个 hash 目录——注册的必须是
		// 精确工作区目录而不是父目录，否则任意项目工作区互信。
		const otherProjectRoot = join(await createTemporaryRoot(), "other-project");
		const otherWorkspaceFile = join(resolveCodeProjectAiWorkspace(otherProjectRoot).directory, "pipeline", "x.md");
		expect(() => assertFilesystemPathWithinProject(otherWorkspaceFile)).toThrowError(
			"Path is outside any known project directory",
		);
		// 无关目录：从未注册的独立临时目录。
		const unrelatedFile = join(await createTemporaryRoot(), "innocent.md");
		expect(() => assertFilesystemPathWithinProject(unrelatedFile)).toThrowError(
			"Path is outside any known project directory",
		);
	});
});

describe("记忆策略透传（TASK-0375，ADR-0149）", () => {
	it("缺省不携带 memoryPolicy：旧行为零变化", async () => {
		const root = await createTemporaryRoot();
		const resolved = await resolveDesktopSessionConfig(undefined, "conversation", "interactive");
		const sessionConfiguration = parseCodingAgentRuntimeSessionConfiguration(
			resolved.config.agent?.sessionConfiguration,
		);
		expect(sessionConfiguration.memoryPolicy).toBeUndefined();
		expect(sessionConfiguration.memoryMode).toBeUndefined();
		void root;
	});

	it("memoryPolicy 原样透传进会话配置并被边界接受", async () => {
		const resolved = await resolveDesktopSessionConfig(
			{
				cwd: process.cwd(),
				memoryPolicy: { mode: "explicit", allowedScopes: ["user", "project"] },
			},
			"conversation",
			"interactive",
		);
		const sessionConfiguration = parseCodingAgentRuntimeSessionConfiguration(
			resolved.config.agent?.sessionConfiguration,
		);
		expect(sessionConfiguration.memoryPolicy).toEqual({ mode: "explicit", allowedScopes: ["user", "project"] });
	});

	it("非法 memoryPolicy 在 RuntimeHost 边界被稳定错误拒绝", async () => {
		const resolved = await resolveDesktopSessionConfig(
			{
				cwd: process.cwd(),
				memoryPolicy: { mode: "automatic", allowedScopes: ["user"] },
			},
			"conversation",
			"interactive",
		);
		expect(() =>
			parseCodingAgentRuntimeSessionConfiguration(resolved.config.agent?.sessionConfiguration),
		).toThrowError(/extractionBudget|memoryPolicy/);
	});
});
