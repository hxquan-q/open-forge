import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCodingAgentRuntimeSessionConfiguration } from "@vetta/coding-agent/composition";
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
