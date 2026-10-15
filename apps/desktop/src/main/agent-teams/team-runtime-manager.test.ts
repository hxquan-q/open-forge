import type { AgentTeamDocument, TeamSessionDocument } from "@vetta/agent-team";
import type { RuntimeHost, SessionConfig, SessionExecutionMode } from "@vetta/runtime-core";
import type { SessionExtensionFunctionSource } from "@vetta/runtime-core/session-extensions";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDesktopSessionConfig } from "../conversations/resolve-session-config.js";
import type { TeamCollaborationStore } from "./team-collaboration-store.js";
import { TeamRuntimeManager, type TeamRuntimeManagerOptions } from "./team-runtime-manager.js";
import type { TeamSessionStateRepository } from "./team-session-state-repository.js";

vi.mock("../conversations/resolve-session-config.js", () => ({
	resolveDesktopSessionConfig: vi.fn(async (config: SessionConfig) => ({ config })),
}));
vi.mock("../logger.js", () => ({
	getAppLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

/** 自包含的团队文档：Profile 自带 systemPrompt，不依赖 blueprint 注册表。 */
function teamDocument(): AgentTeamDocument {
	return {
		schemaVersion: 1,
		revision: 1,
		agents: [
			{
				id: "agent",
				revision: 1,
				name: "执行者",
				description: "负责实现与自验证",
				mentionHandle: "executor",
				blueprintId: "unregistered-blueprint",
				systemPrompt: "你是团队的执行者。",
				abilities: { selectionMode: "custom", skills: [], mcpServers: [], plugins: [] },
				scope: { kind: "library" },
				createdAt: 1,
				updatedAt: 1,
			},
		],
		teams: [
			{
				id: "team",
				revision: 1,
				name: "Team",
				description: "",
				leaderMemberId: "member",
				orchestrationPolicyId: "policy",
				contextPolicyId: "policy",
				members: [{ id: "member", handle: "executor", binding: { kind: "reference", agentProfileId: "agent" } }],
				createdAt: 1,
				updatedAt: 1,
			},
		],
	};
}

function teamSessionDocument(cwd: string): TeamSessionDocument {
	return {
		schemaVersion: 1,
		revision: 1,
		id: "team-session",
		teamId: "team",
		name: "Team",
		cwd,
		leaderMemberId: "member",
		memberHandles: { member: "executor" },
		createdAt: 1,
		updatedAt: 1,
		events: [],
		memberRuntime: {
			member: {
				sessionId: "stale-member",
				sessionPath: "C:/sessions/member.jsonl",
				agentProfileId: "agent",
				agentProfileRevision: 1,
				deliveredEventIds: [],
			},
		},
	};
}

/** Runtime 桩：建会话即绑定 sessionPath，恢复路径因此能对上持久化记录。 */
function runtimeStub(): RuntimeHost {
	const paths = new Map<string, string>();
	let created = 0;
	return {
		getSessionPath: (sessionId: string) => paths.get(sessionId),
		createSession: vi.fn(async (config: SessionConfig) => {
			const sessionId = config.sessionId ?? `runtime-${++created}`;
			paths.set(sessionId, config.sessionPath ?? `C:/sessions/${sessionId}.jsonl`);
			return { sessionId };
		}),
	} as unknown as RuntimeHost;
}

function teamRuntimeManager(
	runtime: RuntimeHost,
	options?: Pick<TeamRuntimeManagerOptions, "memberSessionExtensionFunctions">,
): TeamRuntimeManager {
	// sessionState 只承接 restoreMembers 的持久化；collaborationStore 仅被
	// bindPinnedModelContext 闭包引用，本测试不触发上下文回填。
	const sessionState = { persist: vi.fn(async () => undefined) } as unknown as TeamSessionStateRepository;
	return new TeamRuntimeManager({
		runtime: () => runtime,
		createTeamToolRegistrations: () => [],
		sessionState,
		collaborationStore: {} as unknown as TeamCollaborationStore,
		...options,
	});
}

function requestedConfigCapabilityProfiles(): (string | undefined)[] {
	return vi.mocked(resolveDesktopSessionConfig).mock.calls.map(([config]) => config?.capabilityProfile);
}

const executionMode: SessionExecutionMode = "full-access";

describe("TeamRuntimeManager 能力 Profile 裁决（TASK-0078）", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("新建成员 Runtime 以 coding 能力 Profile 解析会话配置", async () => {
		const document = teamDocument();
		const manager = teamRuntimeManager(runtimeStub());

		const state = await manager.createMemberRuntime(
			"team-session",
			document.teams[0].members[0],
			document.teams[0],
			document,
			"C:/workspace",
			executionMode,
		);

		expect(state.sessionPath).toBe("C:/sessions/runtime-1.jsonl");
		expect(requestedConfigCapabilityProfiles()).toEqual(["coding"]);
	});

	it("新建协调 Runtime 以 coding 能力 Profile 解析会话配置", async () => {
		const manager = teamRuntimeManager(runtimeStub());

		const state = await manager.createCoordinationRuntime("C:/workspace");

		expect(state.sessionPath).toBe("C:/sessions/runtime-1.jsonl");
		expect(requestedConfigCapabilityProfiles()).toEqual(["coding"]);
	});

	it("恢复协调 Runtime 仍以 coding 能力 Profile 解析会话配置", async () => {
		const manager = teamRuntimeManager(runtimeStub());

		const state = await manager.createCoordinationRuntime("C:/workspace", "C:/sessions/coord.jsonl", "coord");

		expect(state).toEqual({ sessionId: "coord", sessionPath: "C:/sessions/coord.jsonl" });
		expect(requestedConfigCapabilityProfiles()).toEqual(["coding"]);
	});

	it("恢复成员 Runtime 以 coding 能力 Profile 重建会话配置", async () => {
		const document = teamDocument();
		const session = teamSessionDocument("C:/workspace");
		const manager = teamRuntimeManager(runtimeStub());

		const restored = await manager.restoreMembers(session, document);

		// 恢复请求同时携带 sessionPath 与显式 coding：成员会话没有固化记录可回落，
		// 裁决必须由请求显式声明，而不是指望缺省推导。
		expect(requestedConfigCapabilityProfiles()).toEqual(["coding"]);
		expect(restored.memberRuntime.member).toMatchObject({
			sessionPath: "C:/sessions/member.jsonl",
			agentProfileId: "agent",
		});
	});
});

describe("成员会话函数源收窄（TASK-0123）", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	const memberSource: SessionExtensionFunctionSource = {
		has: () => false,
		invoke: async () => undefined as never,
	};

	it("新建成员 Runtime 把收窄后的函数源带进会话配置", async () => {
		const document = teamDocument();
		const memberSessionExtensionFunctions = vi.fn(() => memberSource);
		const manager = teamRuntimeManager(runtimeStub(), { memberSessionExtensionFunctions });

		await manager.createMemberRuntime(
			"team-session",
			document.teams[0].members[0],
			document.teams[0],
			document,
			"C:/workspace",
			executionMode,
		);

		const [config] = vi.mocked(resolveDesktopSessionConfig).mock.calls[0];
		expect(config?.sessionExtensionFunctions).toBe(memberSource);
	});

	it("恢复成员 Runtime 同样携带收窄函数源", async () => {
		const document = teamDocument();
		const session = teamSessionDocument("C:/workspace");
		const memberSessionExtensionFunctions = vi.fn(() => memberSource);
		const manager = teamRuntimeManager(runtimeStub(), { memberSessionExtensionFunctions });

		await manager.restoreMembers(session, document);

		const [config] = vi.mocked(resolveDesktopSessionConfig).mock.calls[0];
		expect(config?.sessionExtensionFunctions).toBe(memberSource);
	});

	it("协调 Runtime 不收窄函数源，沿用 Composition 默认", async () => {
		const memberSessionExtensionFunctions = vi.fn(() => memberSource);
		const manager = teamRuntimeManager(runtimeStub(), { memberSessionExtensionFunctions });

		await manager.createCoordinationRuntime("C:/workspace");

		const [config] = vi.mocked(resolveDesktopSessionConfig).mock.calls[0];
		expect(config?.sessionExtensionFunctions).toBeUndefined();
		expect(memberSessionExtensionFunctions).not.toHaveBeenCalled();
	});
});
