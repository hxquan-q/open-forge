// Copyright The Open Forge contributors.
import { createAgentTeamFixture, type TeamSessionDocument } from "@vetta/agent-team";
import type { RuntimeHost, SessionConfig } from "@vetta/runtime-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationOwnershipCatalogPort } from "../conversations/conversation-ownership-catalog.js";
import { registerPresetPluginBlueprints } from "./preset-plugin-blueprints.testing.js";
import type { LegacyTeamSessionRepository } from "./team-session-repository.js";
import { AgentTeamSessionService } from "./team-session-service.js";
import type { TeamSessionStateRepository } from "./team-session-state-repository.js";

vi.mock("../conversations/resolve-session-config.js", () => ({
	resolveDesktopSessionConfig: vi.fn(async (config: SessionConfig) => ({ config })),
}));
vi.mock("../logger.js", () => ({
	getAppLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("../ipc/fs.js", () => ({ readDesktopConfig: vi.fn(async () => ({})) }));
vi.mock("../sandbox/capability.js", () => ({ assertSandboxAvailableForMode: vi.fn(async () => undefined) }));
vi.mock("../runtime.js", () => ({ getSharedRuntime: vi.fn() }));
vi.mock("./team-session-file-reader.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("./team-session-file-reader.js")>();
	return {
		...original,
		readTeamConversationDocument: vi.fn(original.readTeamConversationDocument),
		readTeamConversationHistory: vi.fn(async () => []),
	};
});

const COORDINATION_PATH = "C:/sessions/team-1.coordination.jsonl";

function sessionDocument(teamId: string, memberId = "leader"): TeamSessionDocument {
	return {
		schemaVersion: 1,
		revision: 0,
		id: "team-1",
		teamId,
		name: "僵尸会话",
		cwd: "C:/workspace",
		leaderMemberId: memberId,
		activeMemberIds: [memberId],
		memberHandles: {},
		createdAt: 1,
		updatedAt: 2,
		coordinationRuntime: { sessionId: "team-1-coordination", sessionPath: COORDINATION_PATH },
		events: [],
		memberRuntime: {
			[memberId]: {
				sessionId: "team-1-member-leader",
				sessionPath: "C:/sessions/team-1.member-leader.jsonl",
				agentProfileRevision: 1,
				deliveredEventIds: [],
			},
		},
	};
}

function ownershipCatalog(calls: string[] = []): ConversationOwnershipCatalogPort {
	return {
		register: async () => undefined,
		removeByTeamSession: async (teamId, teamSessionId) => {
			calls.push(`${teamId}/${teamSessionId}`);
		},
		listByTeam: async () => [],
		getOwner: async () => undefined,
		filterUserSessions: async (sessions) => [...sessions],
	};
}

describe("AgentTeamSessionService.deleteSession（BUG-0087 降级清理）", () => {
	beforeEach(() => registerPresetPluginBlueprints());
	beforeEach(() => vi.clearAllMocks());

	it("coordination 文件丢失时 read 必败，仍按 legacy 索引兜底枚举 runtime 并完成删除", async () => {
		const document = createAgentTeamFixture();
		const team = document.teams[0];
		if (!team) throw new Error("built-in Agent Team fixture is missing");
		const persisted = sessionDocument(team.id);

		// 日志同款现场：coordination JSONL 丢失，恢复协调 runtime 即抛 Conversation not found。
		const deleteSessionCalls: string[] = [];
		const runtime = {
			createSession: vi.fn(async () => {
				throw new Error("Conversation not found");
			}),
			getSessionPath: () => undefined,
			deleteSession: vi.fn(async (sessionPath: string) => {
				deleteSessionCalls.push(sessionPath);
			}),
			subscribe: () => () => undefined,
		} as unknown as RuntimeHost;
		const repositoryDelete = vi.fn(async () => undefined);
		const repository: LegacyTeamSessionRepository = {
			read: async (id) => {
				if (id !== persisted.id) throw new Error(`missing session: ${id}`);
				return persisted;
			},
			delete: repositoryDelete,
			list: async () => [persisted],
		};
		const ownershipCalls: string[] = [];
		const service = new AgentTeamSessionService({
			runtime,
			repository,
			ownershipCatalog: ownershipCatalog(ownershipCalls),
			readDocument: async () => document,
		});

		await expect(
			service.deleteSession({ id: persisted.id, coordinationSessionPath: COORDINATION_PATH }),
		).resolves.toBeUndefined();
		expect(deleteSessionCalls.sort()).toEqual([COORDINATION_PATH, "C:/sessions/team-1.member-leader.jsonl"]);
		expect(repositoryDelete).toHaveBeenCalledWith(persisted.id);
		expect(ownershipCalls).toEqual([`${team.id}/${persisted.id}`]);
	});

	it("read 失败且所有文档源都缺时仍清理索引，僵尸会话从列表消失", async () => {
		const document = createAgentTeamFixture();
		const team = document.teams[0];
		if (!team) throw new Error("built-in Agent Team fixture is missing");
		const deleteSessionRuntime = vi.fn(async () => undefined);
		const runtime = {
			createSession: vi.fn(async () => {
				throw new Error("Conversation not found");
			}),
			getSessionPath: () => undefined,
			deleteSession: deleteSessionRuntime,
			subscribe: () => () => undefined,
		} as unknown as RuntimeHost;
		const repositoryDelete = vi.fn(async () => undefined);
		const repository: LegacyTeamSessionRepository = {
			read: async () => {
				throw new Error("missing session: ghost");
			},
			delete: repositoryDelete,
			list: async () => [],
		};
		const ownershipCalls: string[] = [];
		const service = new AgentTeamSessionService({
			runtime,
			repository,
			ownershipCatalog: ownershipCatalog(ownershipCalls),
			readDocument: async () => document,
		});

		await expect(
			service.deleteSession({ id: "ghost", coordinationSessionPath: "C:/sessions/ghost.jsonl" }),
		).resolves.toBeUndefined();
		expect(deleteSessionRuntime).not.toHaveBeenCalled();
		expect(repositoryDelete).toHaveBeenCalledWith("ghost");
		expect(ownershipCalls).toEqual([]);
	});

	it("降级删除中单个 member 路径被外部实例持租约时记 warn 跳过，不阻断其余清理", async () => {
		const document = createAgentTeamFixture();
		const team = document.teams[0];
		if (!team) throw new Error("built-in Agent Team fixture is missing");
		const persisted = sessionDocument(team.id);

		const deleteSessionCalls: string[] = [];
		const runtime = {
			createSession: vi.fn(async () => {
				throw new Error("Conversation not found");
			}),
			getSessionPath: () => undefined,
			deleteSession: vi.fn(async (sessionPath: string) => {
				deleteSessionCalls.push(sessionPath);
				if (sessionPath.includes("member-leader")) {
					throw new Error("Conversation is already owned by another runtime");
				}
			}),
			subscribe: () => () => undefined,
		} as unknown as RuntimeHost;
		const repositoryDelete = vi.fn(async () => undefined);
		const repository: LegacyTeamSessionRepository = {
			read: async () => persisted,
			delete: repositoryDelete,
			list: async () => [persisted],
		};
		const service = new AgentTeamSessionService({
			runtime,
			repository,
			readDocument: async () => document,
		});

		await expect(
			service.deleteSession({ id: persisted.id, coordinationSessionPath: COORDINATION_PATH }),
		).resolves.toBeUndefined();
		expect(deleteSessionCalls.sort()).toEqual([COORDINATION_PATH, "C:/sessions/team-1.member-leader.jsonl"]);
		expect(repositoryDelete).toHaveBeenCalledWith(persisted.id);
	});

	it("read 成功时保持严格语义：runtime 路径删除失败仍向上传播", async () => {
		const document = createAgentTeamFixture();
		const team = document.teams[0];
		if (!team) throw new Error("built-in Agent Team fixture is missing");
		// 只留 coordination runtime，且与 fixture roster 完全对齐（reconcile 提前返回），
		// read 走缓存命中即成功，删除面缩小到单条 coordination 路径。
		const persisted = {
			...sessionDocument(team.id),
			teamRevision: team.revision,
			leaderMemberId: team.leaderMemberId,
			activeMemberIds: team.members.map((member) => member.id),
			memberHandles: Object.fromEntries(team.members.map((member) => [member.id, member.handle])),
			memberRuntime: {},
		};
		const activePaths = new Map<string, string>([["team-1-coordination", COORDINATION_PATH]]);

		const runtime = {
			createSession: vi.fn(async () => {
				throw new Error("unreachable: cached document short-circuits restore");
			}),
			getSessionPath: (sessionId: string) => activePaths.get(sessionId),
			deleteSession: vi.fn(async (sessionPath: string) => {
				if (sessionPath === COORDINATION_PATH) {
					throw new Error("Conversation is already owned by another runtime");
				}
			}),
			appendSessionMetadataEntry: vi.fn(async () => undefined),
			readSessionDocument: () => ({ entries: [], activeLeafId: null, revision: 0 }),
			subscribe: () => () => undefined,
		} as unknown as RuntimeHost;
		const repository: LegacyTeamSessionRepository = {
			read: async () => persisted,
			delete: vi.fn(async () => undefined),
			list: async () => [persisted],
		};
		const service = new AgentTeamSessionService({
			runtime,
			repository,
			ownershipCatalog: ownershipCatalog(),
			readDocument: async () => document,
		});
		// 预置内存文档让 read 走缓存命中——此路径语义必须保持严格串行。
		(service as unknown as { sessionState: TeamSessionStateRepository }).sessionState.set(persisted);

		await expect(service.deleteSession(persisted.id)).rejects.toThrow(
			"Conversation is already owned by another runtime",
		);
	});
});
