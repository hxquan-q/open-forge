// Modified by The Open Forge contributors.
import type { TeamSessionDocument } from "@vetta/agent-team";
import type { SessionConfig } from "@vetta/runtime-core";
import { describe, expect, it, vi } from "vitest";
import {
	reconfigureTeamMemberRuntime,
	type TeamMemberRuntimeReconfigurationHost,
} from "./team-member-runtime-reconfiguration.js";

function sessionDocument(): TeamSessionDocument {
	return {
		schemaVersion: 1,
		revision: 2,
		id: "team-session",
		teamId: "team",
		name: "Team",
		cwd: "C:/workspace",
		leaderMemberId: "leader",
		memberHandles: { leader: "leader" },
		createdAt: 1,
		updatedAt: 1,
		events: [],
		memberRuntime: {
			leader: {
				sessionId: "old-runtime",
				sessionPath: "C:/sessions/leader.jsonl",
				agentProfileId: "agent",
				agentProfileRevision: 1,
				deliveredEventIds: [],
			},
		},
	};
}

const logger = { info: vi.fn(), error: vi.fn() };

describe("reconfigureTeamMemberRuntime", () => {
	it("reopens the same history with the latest profile revision and persists the new binding", async () => {
		const paths = new Map([["old-runtime", "C:/sessions/leader.jsonl"]]);
		const calls: string[] = [];
		const runtime: TeamMemberRuntimeReconfigurationHost = {
			getSessionPath: (sessionId) => paths.get(sessionId),
			disposeSession: vi.fn(async (sessionId) => {
				calls.push(`dispose:${sessionId}`);
				paths.delete(sessionId);
			}),
			createSession: vi.fn(async (config) => {
				calls.push(`create:${config.sessionPath}`);
				paths.set("new-runtime", String(config.sessionPath));
				return { sessionId: "new-runtime" };
			}),
		};
		const persist = vi.fn(async () => undefined);
		const resolveConfig = vi.fn(
			async (sessionPath) => ({ cwd: "C:/workspace", sessionPath }) satisfies SessionConfig,
		);

		const next = await reconfigureTeamMemberRuntime({
			session: sessionDocument(),
			memberId: "leader",
			agentProfileId: "agent",
			agentProfileRevision: 3,
			runtime,
			resolveConfig,
			persist,
			now: () => 20,
			logger,
		});

		expect(calls).toEqual(["dispose:old-runtime", "create:C:/sessions/leader.jsonl"]);
		expect(next.memberRuntime.leader).toMatchObject({
			sessionId: "new-runtime",
			agentProfileRevision: 3,
		});
		expect(next).toMatchObject({ revision: 3, updatedAt: 20 });
		expect(persist).toHaveBeenCalledWith(next);
	});

	it("treats a SESSION_NOT_FOUND dispose in the finalize race as an idempotent no-op (BUG-0115)", async () => {
		const paths = new Map([["old-runtime", "C:/sessions/leader.jsonl"]]);
		const runtime: TeamMemberRuntimeReconfigurationHost = {
			getSessionPath: (sessionId) => paths.get(sessionId),
			disposeSession: vi.fn(async () => {
				// 收尾窗口内 runtime 已被卸载：目录仍报告绑定，dispose 却找不到会话。
				throw {
					code: "SESSION_NOT_FOUND",
					message: "Session not found: old-runtime",
					retryable: false,
					origin: "runtime",
				};
			}),
			createSession: vi.fn(async (config) => {
				paths.set("new-runtime", String(config.sessionPath));
				return { sessionId: "new-runtime" };
			}),
		};
		const persist = vi.fn(async () => undefined);

		const next = await reconfigureTeamMemberRuntime({
			session: sessionDocument(),
			memberId: "leader",
			agentProfileId: "agent",
			agentProfileRevision: 3,
			runtime,
			resolveConfig: async (sessionPath) => ({ cwd: "C:/workspace", sessionPath }) satisfies SessionConfig,
			persist,
			now: () => 20,
			logger,
		});

		expect(runtime.createSession).toHaveBeenCalledTimes(1);
		expect(next.memberRuntime.leader).toMatchObject({ sessionId: "new-runtime", agentProfileRevision: 3 });
		expect(persist).toHaveBeenCalledWith(next);
		expect(logger.info).toHaveBeenCalledWith(
			"team member runtime reconfiguration skipped dispose of unloaded session",
			expect.objectContaining({ memberId: "leader", runtimeSessionId: "old-runtime" }),
		);
		expect(logger.error).not.toHaveBeenCalled();
	});

	it("does nothing when the live runtime already uses the current profile revision", async () => {
		const session = sessionDocument();
		const runtime: TeamMemberRuntimeReconfigurationHost = {
			getSessionPath: vi.fn(() => "C:/sessions/leader.jsonl"),
			createSession: vi.fn(),
			disposeSession: vi.fn(),
		};

		await expect(
			reconfigureTeamMemberRuntime({
				session,
				memberId: "leader",
				agentProfileId: "agent",
				agentProfileRevision: 1,
				runtime,
				resolveConfig: vi.fn(),
				persist: vi.fn(),
				logger,
			}),
		).resolves.toBe(session);
		expect(runtime.createSession).not.toHaveBeenCalled();
	});

	it("restores a missing runtime even when its persisted configuration is unchanged", async () => {
		const paths = new Map<string, string>();
		const runtime: TeamMemberRuntimeReconfigurationHost = {
			getSessionPath: (id) => paths.get(id),
			disposeSession: vi.fn(async () => undefined),
			createSession: vi.fn(async (config) => {
				paths.set("restored", String(config.sessionPath));
				return { sessionId: "restored" };
			}),
		};
		const persist = vi.fn(async () => undefined);
		const next = await reconfigureTeamMemberRuntime({
			session: sessionDocument(),
			memberId: "leader",
			agentProfileId: "agent",
			agentProfileRevision: 1,
			runtime,
			resolveConfig: async (sessionPath) => ({ cwd: "C:/workspace", sessionPath }),
			persist,
			logger,
		});
		expect(next.memberRuntime.leader?.sessionId).toBe("restored");
		expect(paths.get("restored")).toBe("C:/sessions/leader.jsonl");
		expect(persist).toHaveBeenCalledWith(next);
		expect(runtime.disposeSession).not.toHaveBeenCalled();
	});

	it("reopens the member when only its team assignment changed", async () => {
		const paths = new Map([["old-runtime", "C:/sessions/leader.jsonl"]]);
		const runtime: TeamMemberRuntimeReconfigurationHost = {
			getSessionPath: (sessionId) => paths.get(sessionId),
			disposeSession: vi.fn(async (sessionId) => {
				paths.delete(sessionId);
			}),
			createSession: vi.fn(async (config) => {
				paths.set("new-runtime", String(config.sessionPath));
				return { sessionId: "new-runtime" };
			}),
		};

		// Profile 修订没变，变的是团队任务书；只看 Profile 会让成员一直用旧提示词。
		const next = await reconfigureTeamMemberRuntime({
			session: sessionDocument(),
			memberId: "leader",
			agentProfileId: "agent",
			agentProfileRevision: 1,
			assignmentFingerprint: "team-v1-assignment",
			runtime,
			resolveConfig: async (sessionPath) => ({ cwd: "C:/workspace", sessionPath }) satisfies SessionConfig,
			persist: vi.fn(async () => undefined),
			now: () => 20,
			logger,
		});

		expect(runtime.createSession).toHaveBeenCalledTimes(1);
		expect(next.memberRuntime.leader).toMatchObject({ assignmentFingerprint: "team-v1-assignment" });
	});

	it("reopens the member when only the team roster rendered into its prompt changed", async () => {
		const paths = new Map([["old-runtime", "C:/sessions/leader.jsonl"]]);
		const runtime: TeamMemberRuntimeReconfigurationHost = {
			getSessionPath: (sessionId) => paths.get(sessionId),
			disposeSession: vi.fn(async (sessionId) => {
				paths.delete(sessionId);
			}),
			createSession: vi.fn(async (config) => {
				paths.set("new-runtime", String(config.sessionPath));
				return { sessionId: "new-runtime" };
			}),
		};
		const session = sessionDocument();
		const leader = session.memberRuntime.leader;
		if (!leader) throw new Error("fixture session is incomplete");

		// 换队长或改队友职责不动本成员的 Profile 与任务书；只看这两者会让它一直带着旧名册。
		const next = await reconfigureTeamMemberRuntime({
			session: {
				...session,
				memberRuntime: { leader: { ...leader, rosterFingerprint: "team-v1-roster-before" } },
			},
			memberId: "leader",
			agentProfileId: "agent",
			agentProfileRevision: 1,
			rosterFingerprint: "team-v1-roster-after",
			runtime,
			resolveConfig: async (sessionPath) => ({ cwd: "C:/workspace", sessionPath }) satisfies SessionConfig,
			persist: vi.fn(async () => undefined),
			now: () => 20,
			logger,
		});

		expect(runtime.createSession).toHaveBeenCalledTimes(1);
		expect(next.memberRuntime.leader).toMatchObject({ rosterFingerprint: "team-v1-roster-after" });
	});

	it("判加载与 dispose 之间被并发逐出（SESSION_NOT_FOUND）时按幂等继续重开，不掀翻收尾（BUG-0115）", async () => {
		const paths = new Map([["old-runtime", "C:/sessions/leader.jsonl"]]);
		const runtime: TeamMemberRuntimeReconfigurationHost = {
			getSessionPath: (sessionId) => paths.get(sessionId),
			disposeSession: vi.fn(async (sessionId) => {
				paths.delete(sessionId);
				// 事故同款形态：判定时还在内存目录，释放瞬间已被空闲逐出/并发清理掉。
				throw { code: "SESSION_NOT_FOUND", message: `Session not found: ${sessionId}`, retryable: false };
			}),
			createSession: vi.fn(async (config) => {
				paths.set("new-runtime", String(config.sessionPath));
				return { sessionId: "new-runtime" };
			}),
		};
		const persist = vi.fn(async () => undefined);

		const next = await reconfigureTeamMemberRuntime({
			session: sessionDocument(),
			memberId: "leader",
			agentProfileId: "agent",
			agentProfileRevision: 3,
			runtime,
			resolveConfig: async (sessionPath) => ({ cwd: "C:/workspace", sessionPath }) satisfies SessionConfig,
			persist,
			now: () => 20,
			logger,
		});

		expect(runtime.createSession).toHaveBeenCalledWith(
			expect.objectContaining({ sessionPath: "C:/sessions/leader.jsonl" }),
		);
		expect(next.memberRuntime.leader).toMatchObject({ sessionId: "new-runtime", agentProfileRevision: 3 });
		expect(persist).toHaveBeenCalledWith(next);
	});

	it("dispose 抛非 SESSION_NOT_FOUND 错误时仍然向上传播（BUG-0115 严格语义）", async () => {
		const paths = new Map([["old-runtime", "C:/sessions/leader.jsonl"]]);
		const runtime: TeamMemberRuntimeReconfigurationHost = {
			getSessionPath: (sessionId) => paths.get(sessionId),
			disposeSession: vi.fn(async () => {
				throw new Error("Conversation is already owned by another runtime");
			}),
			createSession: vi.fn(),
		};

		await expect(
			reconfigureTeamMemberRuntime({
				session: sessionDocument(),
				memberId: "leader",
				agentProfileId: "agent",
				agentProfileRevision: 3,
				runtime,
				resolveConfig: async (sessionPath) => ({ cwd: "C:/workspace", sessionPath }) satisfies SessionConfig,
				persist: vi.fn(async () => undefined),
				logger,
			}),
		).rejects.toThrow("Conversation is already owned by another runtime");
		expect(runtime.createSession).not.toHaveBeenCalled();
	});
});
