// Modified by The Open Forge contributors.
import { createAgentTeamFixture } from "@vetta/agent-team";
import { describe, expect, it, vi } from "vitest";
import { listTeamSidebarConversations, readSidebarProjectPaths } from "./team-sidebar-conversation-projection.js";

vi.mock("../agent-teams/agent-team-store.js", () => ({ agentTeamStore: {} }));
vi.mock("../agent-teams/team-session-service.js", () => ({ agentTeamSessionService: {} }));
vi.mock("../config/desktop-config-store.js", () => ({ readDesktopConfig: vi.fn() }));

describe("listTeamSidebarConversations", () => {
	it("projects Team sessions by semantic placement without exposing the Team name", async () => {
		const document = createAgentTeamFixture();
		const team = document.teams[0];
		if (!team) throw new Error("missing Team fixture");
		const result = await listTeamSidebarConversations({
			listHistoryTeamIds: async () => [],
			readDocument: async () => document,
			listProjectPaths: async () => ["C:/Projects/Vetta"],
			listSessions: async () => [
				{
					id: "project-session",
					coordinationSessionPath: "C:/sessions/project.jsonl",
					title: "Project work",
					createdAt: 1,
					updatedAt: 3,
					workspaceKind: "project",
					workspaceId: "c:/projects/vetta/",
					cwd: "c:/projects/vetta/",
				},
				{
					id: "session-workspace",
					coordinationSessionPath: "C:/sessions/isolated.jsonl",
					title: "Isolated work",
					createdAt: 1,
					updatedAt: 2,
					workspaceKind: "session",
					workspaceId: `agent-team:${team.id}:session:workspace-a`,
					cwd: "C:/session-workspaces/workspace-a",
				},
				{
					id: "legacy-default-session",
					coordinationSessionPath: "C:/sessions/legacy-default.jsonl",
					title: "Legacy default work",
					createdAt: 1,
					updatedAt: 1,
					workspaceKind: "team-default",
					workspaceId: `agent-team:${team.id}`,
					cwd: "C:/team-default",
				},
			],
		});

		expect(result).toEqual([
			expect.objectContaining({
				teamId: team.id,
				teamSessionId: "project-session",
				cwd: "c:/projects/vetta/",
				sessionTitle: "Project work",
				placement: { kind: "project", projectPath: "C:/Projects/Vetta" },
				memberAvatarUrls: expect.any(Array),
			}),
			expect.objectContaining({
				teamSessionId: "session-workspace",
				cwd: "C:/session-workspaces/workspace-a",
				placement: { kind: "default" },
			}),
			expect.objectContaining({
				teamSessionId: "legacy-default-session",
				placement: { kind: "default" },
			}),
		]);
		expect(result.some((item) => "teamName" in item)).toBe(false);
	});

	it("falls back to the default conversation list when a selected project is no longer registered", async () => {
		const document = createAgentTeamFixture();
		const team = document.teams[0];
		if (!team) throw new Error("missing Team fixture");
		const [result] = await listTeamSidebarConversations({
			listHistoryTeamIds: async () => [],
			readDocument: async () => document,
			listProjectPaths: async () => [],
			listSessions: async () => [
				{
					id: "removed-project",
					coordinationSessionPath: "C:/sessions/removed.jsonl",
					title: "Still visible",
					createdAt: 1,
					updatedAt: 2,
					workspaceKind: "project",
					cwd: "C:/Projects/Removed",
				},
			],
		});

		expect(result).toMatchObject({
			cwd: "C:/Projects/Removed",
			placement: { kind: "default" },
		});
	});

	it("默认项目名单并入开发册（allstarProjects）：开发册项目下的团队会话不再落 default", async () => {
		const { readDesktopConfig } = await import("../config/desktop-config-store.js");
		vi.mocked(readDesktopConfig).mockResolvedValue({
			projects: [{ path: "C:/Projects/Vetta" }],
			allstarProjects: [{ path: "D:/DevBook/app" }],
		} as never);

		const paths = await readSidebarProjectPaths();
		expect(paths).toEqual(["C:/Projects/Vetta", "D:/DevBook/app"]);

		// 旧实现只读 config.projects：开发册项目路径缺席，同 cwd 的团队会话
		// resolvePlacement 匹配不到 → placement 落 default（侧栏归错组）。
		const [conversation] = await listTeamSidebarConversations({
			listHistoryTeamIds: async () => [],
			readDocument: async () => createAgentTeamFixture(),
			listProjectPaths: readSidebarProjectPaths,
			listSessions: async () => [
				{
					id: "devbook-team-session",
					coordinationSessionPath: "C:/sessions/devbook.jsonl",
					title: "Dev book team",
					createdAt: 1,
					updatedAt: 2,
					workspaceKind: "project",
					cwd: "D:/DevBook/app",
				},
			],
		});
		expect(conversation).toMatchObject({
			teamSessionId: "devbook-team-session",
			cwd: "D:/DevBook/app",
			placement: { kind: "project", projectPath: "D:/DevBook/app" },
		});
	});
	it("keeps history manageable after its Team definition and project registration disappear", async () => {
		const document = createAgentTeamFixture();
		const result = await listTeamSidebarConversations({
			readDocument: async () => ({ ...document, agents: [], teams: [] }),
			listHistoryTeamIds: async () => ["removed-team"],
			listProjectPaths: async () => [],
			listSessions: async (teamId) =>
				teamId === "removed-team"
					? [
							{
								id: "historical-session",
								coordinationSessionPath: "C:/sessions/history.jsonl",
								title: "Historical work",
								createdAt: 1,
								updatedAt: 2,
								workspaceKind: "project",
								cwd: "C:/missing-project",
							},
						]
					: [],
		});
		expect(result).toEqual([
			expect.objectContaining({
				teamId: "removed-team",
				teamSessionId: "historical-session",
				memberAvatarUrls: [],
				placement: { kind: "default" },
			}),
		]);
	});

	it("数据文件缺失的团队会话透传 dataFileMissing 标记，文件在的条目不携带该字段（BUG-0195）", async () => {
		const document = createAgentTeamFixture();
		const team = document.teams[0];
		if (!team) throw new Error("missing Team fixture");
		const result = await listTeamSidebarConversations({
			listHistoryTeamIds: async () => [team.id],
			readDocument: async () => document,
			listProjectPaths: async () => [],
			listSessions: async () => [
				{
					id: "session-missing",
					coordinationSessionPath: "C:/sessions/missing.jsonl",
					title: "丢文件",
					createdAt: 1,
					updatedAt: 5,
					workspaceKind: "project",
					cwd: "C:/Projects/A",
					dataFileMissing: true,
				},
				{
					id: "session-alive",
					coordinationSessionPath: "C:/sessions/alive.jsonl",
					title: "在盘",
					createdAt: 1,
					updatedAt: 3,
					workspaceKind: "project",
					cwd: "C:/Projects/A",
				},
			],
		});

		expect(result).toEqual([
			expect.objectContaining({ teamSessionId: "session-missing", dataFileMissing: true }),
			expect.objectContaining({ teamSessionId: "session-alive" }),
		]);
		expect("dataFileMissing" in (result[1] ?? {})).toBe(false);
	});
});
