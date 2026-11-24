// Copyright The Open Forge contributors.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentTeamFixture, type TeamSessionDocument } from "@vetta/agent-team";
import { FileConversationRepository } from "@vetta/runtime-node/conversation";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
	ConversationOwnershipCatalogPort,
	ConversationOwnershipRecord,
} from "../conversations/conversation-ownership-catalog.js";
import { readTeamConversationDocument } from "./team-session-file-reader.js";
import { renameTeamSessionWithoutRuntime } from "./team-session-offline-rename.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	vi.restoreAllMocks();
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe("renameTeamSessionWithoutRuntime（BUG-0195 离线改名）", () => {
	it("协调文件缺失时抛稳定文案锚点，不读写任何会话内容", async () => {
		const directory = await mkdtemp(join(tmpdir(), "vetta-offline-rename-missing-"));
		temporaryDirectories.push(directory);
		const missingPath = new FileConversationRepository({ rootDir: directory }).resolveConversationPath(
			"orphan-session",
		);

		await expect(
			renameTeamSessionWithoutRuntime({ id: "orphan-session", coordinationSessionPath: missingPath, title: "x" }),
		).rejects.toThrow(`Team session data file is missing: ${missingPath}`);
	});

	it("文件存在但状态条目属于别的会话或缺失时给出可读错误", async () => {
		const document = createAgentTeamFixture();
		const team = document.teams[0];
		const member = team?.members[0];
		if (!team || !member) throw new Error("built-in Agent Team fixture is missing");
		const directory = await mkdtemp(join(tmpdir(), "vetta-offline-rename-foreign-"));
		temporaryDirectories.push(directory);
		const foreignSession = buildSession(team.id, member.id, member.handle, "foreign-session");
		const { path } = await writeState(directory, foreignSession);

		await expect(
			renameTeamSessionWithoutRuntime({ id: "another-session", coordinationSessionPath: path, title: "x" }),
		).rejects.toThrow("Team coordination Conversation belongs to another session");
	});

	it("改名落盘为新的状态条目并同步所有权索引", async () => {
		const document = createAgentTeamFixture();
		const team = document.teams[0];
		const member = team?.members[0];
		if (!team || !member) throw new Error("built-in Agent Team fixture is missing");
		const directory = await mkdtemp(join(tmpdir(), "vetta-offline-rename-ok-"));
		temporaryDirectories.push(directory);
		const session = buildSession(team.id, member.id, member.handle, "offline-session");
		const { path } = await writeState(directory, session);
		const register = vi.fn(async (_records: readonly ConversationOwnershipRecord[]) => undefined);
		const catalog: ConversationOwnershipCatalogPort = {
			register,
			list: async () => [],
			listByTeam: async () => [],
			getOwner: async () => undefined,
			filterUserSessions: async (sessions) => [...sessions],
		};

		const result = await renameTeamSessionWithoutRuntime({
			id: "offline-session",
			coordinationSessionPath: path,
			title: "离线新标题",
			ownershipCatalog: catalog,
		});

		expect(result.session.title).toBe("离线新标题");
		expect(result.session.revision).toBe(session.revision + 1);
		expect(result.coordinationDocument.revision).toBeGreaterThan(1);
		const persisted = latestState("offline-session", await readTeamConversationDocument("offline-session", path));
		expect(persisted.title).toBe("离线新标题");
		expect(persisted.revision).toBe(session.revision + 1);
		expect(persisted.updatedAt).toBeGreaterThan(session.updatedAt);
		expect(register).toHaveBeenCalledOnce();
		expect(register.mock.calls[0]?.[0]).toEqual([
			expect.objectContaining({
				sessionPath: path,
				title: "离线新标题",
				owner: { kind: "agent-team", teamId: team.id, teamSessionId: "offline-session", role: "coordination" },
			}),
		]);
	});

	it("读后被并发追加推进 revision：CAS 冲突触发锁内重读，改在最新状态之上", async () => {
		const document = createAgentTeamFixture();
		const team = document.teams[0];
		const member = team?.members[0];
		if (!team || !member) throw new Error("built-in Agent Team fixture is missing");
		const directory = await mkdtemp(join(tmpdir(), "vetta-offline-rename-cas-"));
		temporaryDirectories.push(directory);
		const session = buildSession(team.id, member.id, member.handle, "cas-session");
		const { path } = await writeState(directory, session);
		const competing = {
			...session,
			title: "并发写入",
			revision: session.revision + 1,
			updatedAt: session.updatedAt + 1,
		};
		const competingRepository = new FileConversationRepository({ rootDir: directory });
		// 在模块首次锁内读返回之后、CAS 写之前注入一次并发追加（真实文件锁下的第二个实例）。
		const originalRead = FileConversationRepository.prototype.readDocument;
		const readDocument = vi.spyOn(FileConversationRepository.prototype, "readDocument");
		let armed = true;
		readDocument.mockImplementation(async function (this: FileConversationRepository, sessionId: string) {
			const result = (await originalRead.call(this, sessionId)) as Awaited<
				ReturnType<FileConversationRepository["readDocument"]>
			>;
			if (armed) {
				armed = false;
				await competingRepository.execute(sessionId, null, {
					type: "custom.append",
					entryId: "competing-entry",
					customType: "agent-team.session-state.v1",
					data: { customType: "agent-team.session-state.v1", session: competing },
					timestamp: new Date(2).toISOString(),
				});
			}
			return result;
		});

		const result = await renameTeamSessionWithoutRuntime({
			id: "cas-session",
			coordinationSessionPath: path,
			title: "冲突后改名",
		});

		// 最终落盘：并发条目仍在，最新一条是本次改名（基于并发后的 revision 递增）。
		expect(result.session.revision).toBe(competing.revision + 1);
		const persisted = latestState("cas-session", await readTeamConversationDocument("cas-session", path));
		expect(persisted.title).toBe("冲突后改名");
		expect(persisted.revision).toBe(competing.revision + 1);
		await competingRepository.close();
	});

	it("写后复核发现磁盘最新状态不是本次写入时放弃改名", async () => {
		const document = createAgentTeamFixture();
		const team = document.teams[0];
		const member = team?.members[0];
		if (!team || !member) throw new Error("built-in Agent Team fixture is missing");
		const directory = await mkdtemp(join(tmpdir(), "vetta-offline-rename-verify-"));
		temporaryDirectories.push(directory);
		const session = buildSession(team.id, member.id, member.handle, "verify-session");
		const { path } = await writeState(directory, session);
		const overtaking = {
			...session,
			title: "反超写入",
			revision: session.revision + 5,
			updatedAt: session.updatedAt + 5,
		};
		const overtakingRepository = new FileConversationRepository({ rootDir: directory });
		// 写后复核那次重读之前注入一条更新的状态条目：复核必须发现最新条目不是本次写入。
		const originalRead = FileConversationRepository.prototype.readDocument;
		const readDocument = vi.spyOn(FileConversationRepository.prototype, "readDocument");
		let calls = 0;
		readDocument.mockImplementation(async function (this: FileConversationRepository, sessionId: string) {
			calls += 1;
			if (calls === 2) {
				await overtakingRepository.execute(sessionId, null, {
					type: "custom.append",
					entryId: "overtaking-entry",
					customType: "agent-team.session-state.v1",
					data: { customType: "agent-team.session-state.v1", session: overtaking },
					timestamp: new Date(3).toISOString(),
				});
			}
			return originalRead.call(this, sessionId) as ReturnType<FileConversationRepository["readDocument"]>;
		});

		await expect(
			renameTeamSessionWithoutRuntime({ id: "verify-session", coordinationSessionPath: path, title: "复核失败" }),
		).rejects.toThrow("Team session rename could not be confirmed on disk");
		await overtakingRepository.close();
	});
});

function buildSession(teamId: string, memberId: string, memberHandle: string, id: string): TeamSessionDocument {
	return {
		schemaVersion: 1,
		revision: 2,
		id,
		teamId,
		workspaceId: `agent-team:${teamId}`,
		workspaceKind: "team-default",
		name: "团队",
		cwd: "C:/workspace",
		leaderMemberId: memberId,
		activeMemberIds: [memberId],
		memberHandles: { [memberId]: memberHandle },
		createdAt: 1,
		updatedAt: 2,
		runtimeStatus: "preparing",
		events: [],
		memberRuntime: {},
	};
}

async function writeState(directory: string, session: TeamSessionDocument): Promise<{ path: string }> {
	const repository = new FileConversationRepository({ rootDir: directory });
	try {
		await repository.create({ sessionId: session.id, createdAt: 1 });
		const path = repository.resolveConversationPath(session.id);
		const full: TeamSessionDocument = {
			...session,
			coordinationRuntime: { sessionId: session.id, sessionPath: path },
		};
		await repository.execute(session.id, null, {
			type: "custom.append",
			entryId: "state-entry",
			customType: "agent-team.session-state.v1",
			data: { customType: "agent-team.session-state.v1", session: full },
			timestamp: new Date(1).toISOString(),
		});
		return { path };
	} finally {
		await repository.close();
	}
}

function latestState(
	id: string,
	document: { entries: readonly { type: string; customType?: string; data?: unknown }[] },
) {
	for (let index = document.entries.length - 1; index >= 0; index -= 1) {
		const entry = document.entries[index];
		if (entry?.type !== "custom" || entry.customType !== "agent-team.session-state.v1") continue;
		const data = entry.data as { session?: unknown };
		if (typeof data.session === "object" && data.session !== null) {
			return data.session as TeamSessionDocument;
		}
	}
	throw new Error(`Team session state is missing from coordination Conversation: ${id}`);
}
