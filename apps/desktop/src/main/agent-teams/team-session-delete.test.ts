// Copyright The Open Forge contributors.
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type AgentTeamDocument,
	createAgentTeamFixture,
	parseTeamSessionDocument,
	type TeamSessionDocument,
} from "@vetta/agent-team";
import type { RuntimeHost, SessionConfig } from "@vetta/runtime-core";
import {
	FileConversationOwnershipManager,
	FileConversationRepository,
	FileConversationRuntimeSessionCatalog,
} from "@vetta/runtime-node/conversation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	ConversationOwnershipCatalogPort,
	ConversationOwnershipRecord,
} from "../conversations/conversation-ownership-catalog.js";
import { ConversationOwnershipCatalog } from "../conversations/conversation-ownership-catalog.js";
import { listTeamSidebarConversations } from "../conversations/team-sidebar-conversation-projection.js";
import { AgentTeamStore } from "./agent-team-store.js";
import { registerPresetPluginBlueprints } from "./preset-plugin-blueprints.testing.js";
import { TeamMemberModelPreferences } from "./team-member-model-preferences.js";
import type { LegacyTeamSessionRepository } from "./team-session-repository.js";
import { createLegacyTeamSessionRepository } from "./team-session-repository.js";
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

function deferred() {
	let resolve = (): void => {};
	const promise = new Promise<void>((fulfill) => {
		resolve = fulfill;
	});
	return { promise, resolve };
}

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
		memberHandles: { [memberId]: memberId },
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
		list: async () => [],
		listByTeam: async () => [],
		getOwner: async () => undefined,
		filterUserSessions: async (sessions) => [...sessions],
	};
}

describe("AgentTeamSessionService.deleteSession（BUG-0087 降级清理）", () => {
	const roots: string[] = [];
	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })),
		);
	});
	beforeEach(() => registerPresetPluginBlueprints());
	beforeEach(() => vi.clearAllMocks());

	async function historyFixture() {
		const root = await mkdtemp(join(tmpdir(), "team-history-delete-"));
		roots.push(root);
		let config: AgentTeamDocument = createAgentTeamFixture();
		let sequence = 0;
		const store = new AgentTeamStore({
			repository: {
				read: async () => config,
				write: async (next) => {
					config = next;
				},
			},
			createId: () => `history-config-${++sequence}`,
		});
		const leader = await store.createAgent({
			name: "Historical leader",
			mentionHandle: "history-leader",
			blueprintId: "builder",
		});
		const worker = await store.createAgent({
			name: "Historical worker",
			mentionHandle: "history-worker",
			blueprintId: "builder",
		});
		const team = await store.createTeam({
			name: "Historical team",
			members: [
				{ agentProfileId: leader.id, handle: "leader", bindingKind: "reference", leader: true },
				{ agentProfileId: worker.id, handle: "worker", bindingKind: "reference", leader: false },
			],
		});
		const cwd = join(root, "project");
		await mkdir(cwd);
		await writeFile(join(cwd, "keep.txt"), "ordinary project content");
		const files = new FileConversationRepository({ rootDir: join(root, "conversations") });
		const ids = ["history-coordination", "history-member", "survivor-coordination"];
		try {
			for (const sessionId of ids) await files.create({ sessionId, createdAt: 1, cwd });
		} finally {
			await files.close();
		}
		const paths = ids.map((id) => files.resolveConversationPath(id));
		const coordinationPath = paths[0]!;
		const records: ConversationOwnershipRecord[] = paths.map((sessionPath, index) => ({
			sessionPath,
			title: index === 2 ? "Other history" : "Delete this history",
			createdAt: 1,
			updatedAt: 2,
			owner: {
				kind: "agent-team",
				teamId: team.id,
				teamSessionId: index === 2 ? "survivor" : "history-session",
				role: index === 1 ? "member" : "coordination",
			},
			workspaceKind: "project",
			cwd,
		}));
		const catalogPath = join(root, "owners.json");
		const catalog = new ConversationOwnershipCatalog(catalogPath);
		await catalog.register(records);
		const legacyRoot = join(root, "legacy");
		await mkdir(legacyRoot);
		const legacy = {
			...sessionDocument(team.id),
			id: "history-session",
			cwd,
			workspaceKind: "project" as const,
			workspaceId: cwd,
			leaderMemberId: team.leaderMemberId,
			activeMemberIds: [team.leaderMemberId],
			memberHandles: { [team.leaderMemberId]: "leader" },
			coordinationRuntime: { sessionId: ids[0]!, sessionPath: coordinationPath },
			memberRuntime: {
				[team.leaderMemberId]: {
					sessionId: ids[1]!,
					sessionPath: paths[1]!,
					agentProfileRevision: 1,
					deliveredEventIds: [],
				},
			},
		};
		await writeFile(join(legacyRoot, "history-session.json"), JSON.stringify(parseTeamSessionDocument(legacy)));
		const nativeCatalog = new FileConversationRuntimeSessionCatalog();
		const runtime = {
			createSession: vi.fn(async () => {
				throw new Error("deletion must not restore runtime");
			}),
			getSessionPath: () => undefined,
			deleteSession: vi.fn(async (path: string) => {
				if (!(await nativeCatalog.ownsSession(path)))
					throw { code: "INVALID_REQUEST", message: `Session is not recognized by this runtime: ${path}` };
				await nativeCatalog.deleteSessionArtifacts(path);
			}),
			subscribe: () => () => undefined,
		};
		const readConfiguration = vi.fn(() => store.read());
		const preferences = new TeamMemberModelPreferences(join(root, "model-preferences.json"));
		await preferences.set(team, team.leaderMemberId, { modelKey: "old-provider/old-model" });
		const readModel = vi.fn((teamId: string, memberId: string) => preferences.get(teamId, memberId));
		const service = new AgentTeamSessionService({
			runtime: runtime as unknown as RuntimeHost,
			ownershipCatalog: catalog,
			repository: createLegacyTeamSessionRepository(legacyRoot),
			readDocument: readConfiguration,
			readMemberModelPreference: readModel,
		});
		let projectPaths: readonly string[] = [cwd];
		const list = () =>
			listTeamSidebarConversations({
				readDocument: () => store.read(),
				listProjectPaths: async () => projectPaths,
				listHistoryTeamIds: () => service.listHistoryTeamIds(),
				listSessions: (teamId) => service.listSessions(teamId),
			});
		const removeAgent = async (id: string) => {
			const current = (await store.read()).agents.find((agent) => agent.id === id)!;
			const impact = await store.previewAgentDelete(id);
			await store.deleteAgent(id, {
				expectedRevision: current.revision,
				expectedTeamIds: impact.teams.map((entry) => entry.teamId),
				expectedTeamRevisions: Object.fromEntries(impact.teams.map((entry) => [entry.teamId, entry.teamRevision])),
			});
		};
		return {
			root,
			store,
			team,
			leader,
			worker,
			cwd,
			paths,
			records,
			catalogPath,
			catalog,
			legacyRoot,
			legacy,
			runtime,
			service,
			list,
			removeAgent,
			readConfiguration,
			readModel,
			preferences,
			unregisterProject: () => {
				projectPaths = [];
			},
			reference: { id: "history-session", coordinationSessionPath: coordinationPath },
		};
	}

	it.each([
		"agent-config-and-roster-changed",
		"agent-removed",
		"team-removed",
		"project-moved",
		"project-missing",
		"project-unregistered",
	] as const)(
		"lists and safely deletes history after %s without restoring the old configuration",
		async (scenario) => {
			const f = await historyFixture();
			expect((await f.list()).map((item) => item.teamSessionId)).toContain("history-session");
			let projectContent = join(f.cwd, "keep.txt");
			if (scenario === "agent-config-and-roster-changed") {
				await f.preferences.set(f.team, f.team.leaderMemberId, {
					modelKey: "new-provider/new-model",
					reasoning: "high",
				});
				await f.store.updateAgent(f.leader.id, {
					expectedRevision: f.leader.revision,
					name: "Changed leader",
					description: "Changed role",
					mentionHandle: f.leader.mentionHandle,
					abilities: f.leader.abilities,
					systemPrompt: "Changed instructions and model preference",
				});
				await f.store.updateTeam(f.team.id, {
					expectedRevision: f.team.revision,
					name: "Changed roster",
					description: "",
					members: [{ kind: "existing", memberId: f.team.leaderMemberId, leader: true }],
				});
			}
			if (scenario === "agent-removed" || scenario === "team-removed") await f.removeAgent(f.worker.id);
			if (scenario === "team-removed") {
				await f.removeAgent(f.leader.id);
				expect((await f.store.read()).teams.some((team) => team.id === f.team.id)).toBe(false);
			}
			if (scenario === "project-moved" || scenario === "project-missing") {
				// Both source and destination are fixture-owned children of this temporary root.
				const moved = join(f.root, "relocated-project");
				await rename(f.cwd, moved);
				projectContent = join(moved, "keep.txt");
			}
			if (scenario === "project-unregistered" || scenario === "project-moved") f.unregisterProject();
			const visible = (await f.list()).find((item) => item.teamSessionId === "history-session");
			expect(visible).toBeDefined();
			if (scenario === "team-removed") expect(visible?.memberAvatarUrls).toEqual([]);
			if (scenario === "project-unregistered" || scenario === "project-moved")
				expect(visible?.placement).toEqual({ kind: "default" });
			await expect(f.service.listHistoryTeamIds()).resolves.toContain(f.team.id);
			await f.service.deleteSession(f.reference);
			expect((await f.list()).map((item) => item.teamSessionId)).toEqual(["survivor"]);
			await expect(access(f.paths[0]!)).rejects.toMatchObject({ code: "ENOENT" });
			await expect(access(f.paths[1]!)).rejects.toMatchObject({ code: "ENOENT" });
			await expect(access(f.paths[2]!)).resolves.toBeUndefined();
			await expect(access(join(f.legacyRoot, "history-session.json"))).rejects.toMatchObject({ code: "ENOENT" });
			await expect(readFile(projectContent, "utf8")).resolves.toBe("ordinary project content");
			await expect(new ConversationOwnershipCatalog(f.catalogPath).list()).resolves.toEqual([f.records[2]]);
			await f.service.deleteSession(f.reference);
			expect((await f.list()).map((item) => item.teamSessionId)).toEqual(["survivor"]);
			expect(f.runtime.createSession).not.toHaveBeenCalled();
			expect(f.readConfiguration).not.toHaveBeenCalled();
			expect(f.readModel).not.toHaveBeenCalled();
		},
	);

	it.each(["wrong-request-path", "foreign-member-binding", "ambiguous-team", "path-traversal"] as const)(
		"rejects %s before stop or deletion",
		async (scenario) => {
			const f = await historyFixture();
			const abort = vi.spyOn(f.service, "abort");
			let reference = f.reference;
			if (scenario === "wrong-request-path") reference = { ...reference, coordinationSessionPath: f.paths[2]! };
			if (scenario === "path-traversal") reference = { ...reference, id: "../survivor" };
			if (scenario === "foreign-member-binding") {
				(f.service as unknown as { sessionState: TeamSessionStateRepository }).sessionState.set({
					...f.legacy,
					memberRuntime: { leader: { ...Object.values(f.legacy.memberRuntime)[0]!, sessionPath: f.paths[2]! } },
				});
			}
			if (scenario === "ambiguous-team")
				await f.catalog.register([{ ...f.records[1]!, owner: { ...f.records[1]!.owner, teamId: "another-team" } }]);
			await expect(f.service.deleteSession(reference)).rejects.toThrow(/conflict|Invalid|another session/);
			expect(abort).not.toHaveBeenCalled();
			expect(f.runtime.deleteSession).not.toHaveBeenCalled();
			await expect(access(join(f.legacyRoot, "history-session.json"))).resolves.toBeUndefined();
			for (const path of f.paths) await expect(access(path)).resolves.toBeUndefined();
			expect((await f.catalog.list()).length).toBe(3);
		},
	);

	it("reports a real external ownership lease conflict, retains history and safely retries partial deletion", async () => {
		const f = await historyFixture();
		const lease = await new FileConversationOwnershipManager().acquire(f.paths[1]!);
		try {
			await expect(f.service.deleteSession(f.reference)).rejects.toThrow(/owned|ownership/i);
			await expect(access(f.paths[0]!)).rejects.toMatchObject({ code: "ENOENT" });
			await expect(access(f.paths[1]!)).resolves.toBeUndefined();
			expect((await f.list()).map((item) => item.teamSessionId)).toContain("history-session");
			await expect(new ConversationOwnershipCatalog(f.catalogPath).list()).resolves.toHaveLength(3);
		} finally {
			await lease.release();
		}
		await f.service.deleteSession(f.reference);
		expect((await f.list()).map((item) => item.teamSessionId)).toEqual(["survivor"]);
	});

	it.each(["SESSION_NOT_FOUND", "ENOENT", "INVALID_REQUEST", "EACCES"])(
		"does not hide %s when the target file still exists",
		async (code) => {
			const f = await historyFixture();
			f.runtime.deleteSession.mockRejectedValue({
				code,
				message:
					code === "INVALID_REQUEST"
						? `Session is not recognized by this runtime: ${f.paths[0]}`
						: "delete failed",
			});
			await expect(f.service.deleteSession(f.reference)).rejects.toMatchObject({ code });
			await expect(new ConversationOwnershipCatalog(f.catalogPath).list()).resolves.toHaveLength(3);
			for (const path of f.paths) await expect(access(path)).resolves.toBeUndefined();
		},
	);

	it("propagates ownership persistence I/O failure and allows a later safe retry", async () => {
		const f = await historyFixture();
		const remove = vi
			.spyOn(f.catalog, "removeByTeamSession")
			.mockRejectedValueOnce(Object.assign(new Error("catalog access denied"), { code: "EACCES" }));
		await expect(f.service.deleteSession(f.reference)).rejects.toThrow("catalog access denied");
		expect((await f.list()).map((item) => item.teamSessionId)).toContain("history-session");
		remove.mockRestore();
		await f.service.deleteSession(f.reference);
		await expect(new ConversationOwnershipCatalog(f.catalogPath).list()).resolves.toEqual([f.records[2]]);
	});

	it.each(["read", "rename"] as const)(
		"waits for an in-flight %s transaction and does not revive deleted history",
		async (operation) => {
			const f = await historyFixture();
			const entered = deferred();
			const release = deferred();
			const runtime = {
				...f.runtime,
				getSessionPath: (id: string) =>
					id === "history-coordination" ? f.paths[0] : id === "history-member" ? f.paths[1] : undefined,
				readSessionDocument: () => ({ entries: [], activeLeafId: null, revision: 0 }),
				// read 的闸门在 readDocument（roster 对账），rename 的闸门在持久化：
				// BUG-0195 起改名是管理操作，不再读团队文档。
				appendSessionMetadataEntry:
					operation === "rename"
						? vi.fn(async () => {
								entered.resolve();
								await release.promise;
							})
						: vi.fn(async () => undefined),
				abort: vi.fn(async () => undefined),
			};
			const service = new AgentTeamSessionService({
				runtime: runtime as unknown as RuntimeHost,
				repository: createLegacyTeamSessionRepository(f.legacyRoot),
				ownershipCatalog: f.catalog,
				readDocument: async () => {
					if (operation === "read") entered.resolve();
					await release.promise;
					return f.store.read();
				},
			});
			const state = (service as unknown as { sessionState: TeamSessionStateRepository }).sessionState;
			state.set({
				...f.legacy,
				teamRevision: f.team.revision,
				leaderMemberId: f.team.leaderMemberId,
				activeMemberIds: f.team.members.map((member) => member.id),
				memberHandles: Object.fromEntries(f.team.members.map((member) => [member.id, member.handle])),
			});
			const pending =
				operation === "read"
					? service.read(f.reference.id)
					: service.renameSession(f.reference.id, "Renamed before deletion");
			await entered.promise;
			const deletion = service.deleteSession(f.reference);
			await expect(service.read(f.reference.id)).rejects.toThrow("being deleted");
			release.resolve();
			await pending;
			await deletion;
			await expect(service.listSessions(f.team.id)).resolves.toEqual([expect.objectContaining({ id: "survivor" })]);
			expect(service.isKnownTeamSession(f.reference.id)).toBe(false);
			await expect(new ConversationOwnershipCatalog(f.catalogPath).list()).resolves.toEqual([f.records[2]]);
			expect(runtime.abort).toHaveBeenCalledWith("history-coordination");
			expect(runtime.createSession).not.toHaveBeenCalled();
			await service.deleteSession(f.reference);
			await expect(service.listSessions(f.team.id)).resolves.toHaveLength(1);
		},
	);

	it("waits for an already constructing member and deletes its newly adopted runtime without resurrection", async () => {
		const f = await historyFixture();
		const entered = deferred();
		const release = deferred();
		const stopped = deferred();
		const native = new FileConversationRepository({ rootDir: join(f.root, "conversations") });
		const live = new Map([
			["history-coordination", f.paths[0]!],
			["history-member", f.paths[1]!],
		]);
		const createdPath = native.resolveConversationPath("new-member");
		const runtime = {
			...f.runtime,
			createSession: vi.fn(async () => {
				entered.resolve();
				await release.promise;
				await native.create({ sessionId: "new-member", createdAt: 2, cwd: f.cwd });
				live.set("new-member", createdPath);
				return { sessionId: "new-member" };
			}),
			getSessionPath: (id: string) => live.get(id),
			readSessionDocument: () => ({ entries: [], activeLeafId: null, revision: 0 }),
			appendSessionMetadataEntry: vi.fn(async () => undefined),
			abort: vi.fn(async () => undefined),
			disposeSession: vi.fn(async (id: string) => {
				live.delete(id);
			}),
			deleteSession: vi.fn(async (path: string) => {
				await f.runtime.deleteSession(path);
				for (const [id, current] of live) if (current === path) live.delete(id);
			}),
		};
		const service = new AgentTeamSessionService({
			runtime: runtime as unknown as RuntimeHost,
			repository: createLegacyTeamSessionRepository(f.legacyRoot),
			ownershipCatalog: f.catalog,
			readDocument: () => f.store.read(),
		});
		(service as unknown as { sessionState: TeamSessionStateRepository }).sessionState.set({
			...f.legacy,
			teamRevision: f.team.revision,
			runtimeStatus: "preparing",
			activeMemberIds: f.team.members.map((member) => member.id),
			memberHandles: Object.fromEntries(f.team.members.map((member) => [member.id, member.handle])),
		});
		const abort = service.abort.bind(service);
		vi.spyOn(service, "abort").mockImplementation(async (id) => {
			await abort(id);
			stopped.resolve();
		});
		const warming = service.warmup(f.reference.id, f.team, await f.store.read());
		try {
			await entered.promise;
			let deleted = false;
			const deletion = service.deleteSession(f.reference).then(() => {
				deleted = true;
			});
			await stopped.promise;
			expect(deleted).toBe(false);
			await expect(service.read(f.reference.id)).rejects.toThrow("being deleted");
			release.resolve();
			await warming;
			await deletion;
			expect(live.size).toBe(0);
			await expect(access(createdPath)).rejects.toMatchObject({ code: "ENOENT" });
			await expect(access(f.paths[0]!)).rejects.toMatchObject({ code: "ENOENT" });
			await expect(new ConversationOwnershipCatalog(f.catalogPath).list()).resolves.toEqual([f.records[2]]);
			expect(service.isKnownTeamSession(f.reference.id)).toBe(false);
		} finally {
			release.resolve();
			await warming;
			await native.close();
		}
	});

	it("reads persisted coordination identity offline when ownership and legacy documents are absent", async () => {
		const f = await historyFixture();
		const native = new FileConversationRepository({ rootDir: join(f.root, "conversations") });
		try {
			await native.execute("history-coordination", null, {
				type: "custom.append",
				entryId: "team-state",
				customType: "agent-team.session-state.v1",
				data: { customType: "agent-team.session-state.v1", session: f.legacy },
				timestamp: new Date(2).toISOString(),
			});
		} finally {
			await native.close();
		}
		await f.catalog.removeByTeamSession(f.team.id, f.reference.id);
		// This exact legacy path was created by historyFixture under f.root.
		await rm(join(f.legacyRoot, "history-session.json"));
		await f.service.deleteSession(f.reference);
		await expect(access(f.paths[0]!)).rejects.toMatchObject({ code: "ENOENT" });
		await expect(access(f.paths[1]!)).rejects.toMatchObject({ code: "ENOENT" });
		await expect(access(f.paths[2]!)).resolves.toBeUndefined();
		expect(f.runtime.createSession).not.toHaveBeenCalled();
		expect(f.readConfiguration).not.toHaveBeenCalled();
		await f.service.deleteSession(f.reference);
	});

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

	it("read 失败、所有文档源都缺且无所有权登记时，仍完成 legacy 清理而不调用 runtime 删除", async () => {
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
				throw Object.assign(new Error("missing session: ghost"), { code: "ENOENT" });
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

	it("会话文件与 legacy 文档全缺时，删除后列表不再返回孤儿会话，主控/成员登记清除且其他会话保留", async () => {
		const document = createAgentTeamFixture();
		const team = document.teams[0];
		if (!team) throw new Error("built-in Agent Team fixture is missing");
		const root = await mkdtemp(join(tmpdir(), "team-orphan-delete-"));
		roots.push(root);
		const catalogPath = join(root, "owners.json");
		const catalog = new ConversationOwnershipCatalog(catalogPath);
		const repository = createLegacyTeamSessionRepository(join(root, "legacy-sessions"));
		const targetId = "orphan-team-session";
		const coordinationPath = join(root, "missing-coordination.conversation.jsonl");
		const orphanRecords: ConversationOwnershipRecord[] = [
			coordinationPath,
			...[1, 2, 3].map((index) => join(root, `missing-member-${index}.conversation.jsonl`)),
		].map((sessionPath, index) => ({
			sessionPath,
			owner: {
				kind: "agent-team",
				teamId: team.id,
				teamSessionId: targetId,
				role: index === 0 ? "coordination" : "member",
			},
			title: "待删除的孤儿会话",
			createdAt: 1,
			updatedAt: 2,
		}));
		const survivor: ConversationOwnershipRecord = {
			sessionPath: join(root, "other-coordination.conversation.jsonl"),
			owner: { kind: "agent-team", teamId: team.id, teamSessionId: "other-session", role: "coordination" },
			title: "同团队的其他会话",
			createdAt: 1,
			updatedAt: 1,
		};
		await catalog.register([...orphanRecords, survivor]);
		const runtime = {
			createSession: vi.fn(async () => {
				throw new Error(`No RuntimeHost session backend owns ${coordinationPath}`);
			}),
			getSessionPath: () => undefined,
			deleteSession: vi.fn(async () => undefined),
			subscribe: () => () => undefined,
		} as unknown as RuntimeHost;
		const service = new AgentTeamSessionService({
			runtime,
			repository,
			ownershipCatalog: catalog,
			readDocument: async () => document,
		});

		// 只预置所有权索引，不创建会话文件或 legacy 文档；服务没有内存团队文档。
		await expect(service.listSessions(team.id)).resolves.toEqual([
			expect.objectContaining({ id: targetId, coordinationSessionPath: coordinationPath }),
			expect.objectContaining({ id: "other-session" }),
		]);
		const reference = { id: targetId, coordinationSessionPath: coordinationPath };
		await expect(service.deleteSession(reference)).resolves.toBeUndefined();

		// 删除返回成功不足以证明用户目标达成，必须沿实际列表读取路径确认目标已消失。
		await expect(service.listSessions(team.id)).resolves.toEqual([expect.objectContaining({ id: "other-session" })]);
		await expect(new ConversationOwnershipCatalog(catalogPath).listByTeam(team.id)).resolves.toEqual([survivor]);
		await expect(service.deleteSession(reference)).resolves.toBeUndefined();
		await expect(service.listSessions(team.id)).resolves.toEqual([expect.objectContaining({ id: "other-session" })]);
		await expect(new ConversationOwnershipCatalog(catalogPath).listByTeam(team.id)).resolves.toEqual([survivor]);
	});

	it("历史删除中 member 路径被外部实例持租约时明确报错，不清除管理登记", async () => {
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
		).rejects.toThrow("Conversation is already owned by another runtime");
		expect(deleteSessionCalls.sort()).toEqual([COORDINATION_PATH, "C:/sessions/team-1.member-leader.jsonl"]);
		expect(repositoryDelete).not.toHaveBeenCalled();
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

	it("read 成功但 runtime 报 SESSION_NOT_FOUND（会话未加载）时按幂等成功处理，索引仍清理（BUG-0114）", async () => {
		const document = createAgentTeamFixture();
		const team = document.teams[0];
		if (!team) throw new Error("built-in Agent Team fixture is missing");
		// 与上一用例同构：缓存命中让 read 成功，删除面收敛到单条 coordination 路径。
		const persisted = {
			...sessionDocument(team.id),
			teamRevision: team.revision,
			leaderMemberId: team.leaderMemberId,
			activeMemberIds: team.members.map((member) => member.id),
			memberHandles: Object.fromEntries(team.members.map((member) => [member.id, member.handle])),
			memberRuntime: {},
		};
		const activePaths = new Map<string, string>([["team-1-coordination", COORDINATION_PATH]]);

		// 事故日志同款抛值：runtime 对未加载会话抛普通对象 SESSION_NOT_FOUND（非 Error 实例）。
		const runtime = {
			createSession: vi.fn(async () => {
				throw new Error("unreachable: cached document short-circuits restore");
			}),
			getSessionPath: (sessionId: string) => activePaths.get(sessionId),
			deleteSession: vi.fn(async () => {
				throw { code: "SESSION_NOT_FOUND", message: "Session not found: team-1-coordination", retryable: false };
			}),
			appendSessionMetadataEntry: vi.fn(async () => undefined),
			readSessionDocument: () => ({ entries: [], activeLeafId: null, revision: 0 }),
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
			ownershipCatalog: ownershipCatalog(),
			readDocument: async () => document,
		});
		(service as unknown as { sessionState: TeamSessionStateRepository }).sessionState.set(persisted);

		await expect(service.deleteSession(persisted.id)).resolves.toBeUndefined();
		expect(repositoryDelete).toHaveBeenCalledWith(persisted.id);
	});
});
