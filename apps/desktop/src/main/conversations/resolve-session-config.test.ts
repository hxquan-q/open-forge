import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseCodingAgentRuntimeSessionConfiguration } from "@vetta/coding-agent/composition";
import type { CodingAgentRuntimeToolRegistration } from "@vetta/coding-agent/runtime";
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

vi.mock("../ipc/fs.js", () => ({
	allowProjectRoot: () => undefined,
	readDesktopConfig: async () => desktopConfig,
}));

vi.mock("../plugins/plugin-catalog.js", () => ({
	pluginAgentContributionService: {
		buildRuntimeConfig: () => undefined,
	},
}));

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
