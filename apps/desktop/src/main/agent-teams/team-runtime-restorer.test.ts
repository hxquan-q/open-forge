import type { TeamSessionDocument } from "@vetta/agent-team";
import type { SessionConfig } from "@vetta/runtime-core";
import { describe, expect, it, vi } from "vitest";
import { restoreTeamMemberRuntimes, type TeamRuntimeResumeHost } from "./team-runtime-restorer.js";

function sessionDocument(): TeamSessionDocument {
	return {
		schemaVersion: 1,
		revision: 0,
		id: "team-session",
		teamId: "team",
		name: "Team",
		cwd: "C:/workspace",
		orchestrationPolicyId: "leader-delegates-v1",
		contextPolicyId: "public-results-v1",
		leaderMemberId: "leader",
		memberHandles: { leader: "leader" },
		createdAt: 1,
		updatedAt: 1,
		events: [],
		memberRuntime: {
			leader: {
				sessionId: "old-runtime",
				sessionPath: "C:/sessions/leader.jsonl",
				agentProfileRevision: 1,
				deliveredEventIds: [],
			},
		},
	};
}

const logger = { info: vi.fn(), error: vi.fn() };

describe("restoreTeamMemberRuntimes", () => {
	it("reopens persisted member runtimes, reattaches tools and persists changed ids", async () => {
		const paths = new Map<string, string>();
		const createSession = vi.fn(async () => {
			paths.set("restored-runtime", "C:/sessions/leader.jsonl");
			return { sessionId: "restored-runtime" };
		});
		const runtime: TeamRuntimeResumeHost = {
			getSessionPath: (sessionId) => paths.get(sessionId),
			createSession,
			disposeSession: vi.fn(async () => undefined),
		};
		const persist = vi.fn(async () => undefined);
		const resolveConfig = vi.fn(async ({ memberId, sessionPath, runtimeTools }) => {
			expect(memberId).toBe("leader");
			expect(runtimeTools).toEqual(["delegate-tool"]);
			return {
				config: { cwd: "C:/workspace", sessionPath } satisfies SessionConfig,
				agentProfileId: "agent-leader",
				agentProfileRevision: 2,
			};
		});

		const restored = await restoreTeamMemberRuntimes({
			session: sessionDocument(),
			runtime,
			createRuntimeTools: () => ["delegate-tool"],
			resolveConfig,
			persist,
			now: () => 20,
			logger,
		});

		expect(restored.memberRuntime.leader).toMatchObject({
			sessionId: "restored-runtime",
			agentProfileId: "agent-leader",
			agentProfileRevision: 2,
		});
		expect(restored).toMatchObject({ revision: 1, updatedAt: 20 });
		expect(persist).toHaveBeenCalledWith(restored);
	});

	it("reuses an already active runtime without rewriting the document", async () => {
		const session = sessionDocument();
		const runtime: TeamRuntimeResumeHost = {
			getSessionPath: () => "C:/sessions/leader.jsonl",
			createSession: vi.fn(),
			disposeSession: vi.fn(),
		};
		const persist = vi.fn();

		await expect(
			restoreTeamMemberRuntimes({
				session,
				runtime,
				createRuntimeTools: () => ["delegate-tool"],
				resolveConfig: vi.fn(),
				persist,
				logger,
			}),
		).resolves.toBe(session);
		expect(runtime.createSession).not.toHaveBeenCalled();
		expect(persist).not.toHaveBeenCalled();
	});

	it("isolates a member restore failure: restored members stay, failed member keeps its old entry", async () => {
		// BUG-0093：单个成员的会话文件锁超时（跨实例竞争）不得掀翻整会话加载——
		// 已恢复成员保留，失败成员保留旧 memberRuntime 条目（重启未恢复同语义）。
		const session = sessionDocument();
		const secondPath = "C:/sessions/reviewer.jsonl";
		const expanded: TeamSessionDocument = {
			...session,
			memberHandles: { ...session.memberHandles, reviewer: "reviewer" },
			memberRuntime: {
				...session.memberRuntime,
				reviewer: {
					sessionId: "old-reviewer",
					sessionPath: secondPath,
					agentProfileRevision: 1,
					deliveredEventIds: [],
				},
			},
		};
		const paths = new Map<string, string>();
		const disposeSession = vi.fn(async () => undefined);
		const runtime: TeamRuntimeResumeHost = {
			getSessionPath: (id) => paths.get(id),
			createSession: vi.fn(async (config) => {
				if (config.sessionPath === secondPath) throw new Error("locked");
				paths.set("restored-leader", String(config.sessionPath));
				return { sessionId: "restored-leader" };
			}),
			disposeSession,
		};
		const memberLogger = { info: vi.fn(), error: vi.fn() };
		const persist = vi.fn(async () => undefined);

		const restored = await restoreTeamMemberRuntimes({
			session: expanded,
			runtime,
			createRuntimeTools: () => ["delegate-tool"],
			resolveConfig: async ({ cwd, memberId, sessionPath }) => ({
				config: { cwd, sessionPath },
				agentProfileId: `agent-${memberId}`,
				agentProfileRevision: 1,
			}),
			persist,
			logger: memberLogger,
		});

		expect(restored.memberRuntime.leader).toMatchObject({ sessionId: "restored-leader" });
		expect(restored.memberRuntime.reviewer).toMatchObject({ sessionId: "old-reviewer" });
		expect(disposeSession).not.toHaveBeenCalledWith("restored-leader");
		expect(persist).toHaveBeenCalled();
		expect(memberLogger.error).toHaveBeenCalledWith(
			"team member runtime restore failed",
			expect.objectContaining({ memberId: "reviewer" }),
		);
	});

	it("restores independent missing member runtimes concurrently", async () => {
		const session = {
			...sessionDocument(),
			memberHandles: { leader: "leader", reviewer: "reviewer" },
			memberRuntime: {
				...sessionDocument().memberRuntime,
				reviewer: {
					sessionId: "old-reviewer",
					sessionPath: "C:/sessions/reviewer.jsonl",
					agentProfileRevision: 1,
					deliveredEventIds: [],
				},
			},
		};
		const paths = new Map<string, string>();
		let active = 0;
		let maxActive = 0;
		const runtime: TeamRuntimeResumeHost = {
			getSessionPath: (id) => paths.get(id),
			createSession: vi.fn(async (config) => {
				active += 1;
				maxActive = Math.max(maxActive, active);
				await Promise.resolve();
				const id = `restored-${active}`;
				paths.set(id, String(config.sessionPath));
				active -= 1;
				return { sessionId: id };
			}),
			disposeSession: vi.fn(async () => undefined),
		};

		await restoreTeamMemberRuntimes({
			session,
			runtime,
			createRuntimeTools: () => [],
			resolveConfig: async ({ cwd, sessionPath }) => ({
				config: { cwd, sessionPath },
				agentProfileId: "agent",
				agentProfileRevision: 1,
			}),
			persist: vi.fn(async () => undefined),
			logger,
		});

		expect(maxActive).toBe(2);
	});

	it("disposes the failed member's own half-created runtime without touching siblings", async () => {
		// createSession 已成功、后续 sessionPath 校验失败时：该成员自己创建的
		// runtime 必须回收（替代旧的全局回滚），成功成员不受影响。
		const session = sessionDocument();
		const secondPath = "C:/sessions/reviewer.jsonl";
		const expanded: TeamSessionDocument = {
			...session,
			memberHandles: { ...session.memberHandles, reviewer: "reviewer" },
			memberRuntime: {
				...session.memberRuntime,
				reviewer: {
					sessionId: "old-reviewer",
					sessionPath: secondPath,
					agentProfileRevision: 1,
					deliveredEventIds: [],
				},
			},
		};
		const paths = new Map<string, string>();
		const disposeSession = vi.fn(async () => undefined);
		const runtime: TeamRuntimeResumeHost = {
			getSessionPath: (id) => (id === "restored-reviewer" ? "C:/sessions/elsewhere.jsonl" : paths.get(id)),
			createSession: vi.fn(async (config) => {
				const id = config.sessionPath === secondPath ? "restored-reviewer" : "restored-leader";
				paths.set(id, String(config.sessionPath));
				return { sessionId: id };
			}),
			disposeSession,
		};

		const restored = await restoreTeamMemberRuntimes({
			session: expanded,
			runtime,
			createRuntimeTools: () => [],
			resolveConfig: async ({ cwd, sessionPath }) => ({
				config: { cwd, sessionPath },
				agentProfileId: "agent",
				agentProfileRevision: 1,
			}),
			persist: vi.fn(async () => undefined),
			logger: { info: vi.fn(), error: vi.fn() },
		});

		expect(disposeSession).toHaveBeenCalledWith("restored-reviewer");
		expect(disposeSession).not.toHaveBeenCalledWith("restored-leader");
		expect(restored.memberRuntime.leader).toMatchObject({ sessionId: "restored-leader" });
		expect(restored.memberRuntime.reviewer).toMatchObject({ sessionId: "old-reviewer" });
	});

	it("returns the original document unchanged when every member fails to restore", async () => {
		// 全部成员失败时仍 resolve：会话可打开，成员 turn 各自失败并在下次
		// 冷加载自动重试——好过整会话永久加载失败。
		const session = sessionDocument();
		const persist = vi.fn(async () => undefined);
		const runtime: TeamRuntimeResumeHost = {
			getSessionPath: () => undefined,
			createSession: vi.fn(async () => {
				throw new Error("Timed out acquiring conversation file lock: leader");
			}),
			disposeSession: vi.fn(async () => undefined),
		};

		await expect(
			restoreTeamMemberRuntimes({
				session,
				runtime,
				createRuntimeTools: () => [],
				resolveConfig: async ({ cwd, sessionPath }) => ({
					config: { cwd, sessionPath },
					agentProfileId: "agent",
					agentProfileRevision: 1,
				}),
				persist,
				logger: { info: vi.fn(), error: vi.fn() },
			}),
		).resolves.toBe(session);
		expect(persist).not.toHaveBeenCalled();
	});
});
