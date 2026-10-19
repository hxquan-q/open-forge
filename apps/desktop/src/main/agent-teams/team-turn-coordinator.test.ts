// Modified by The Open Forge contributors.
import {
	AGENT_TEAM_SCHEMA_VERSION,
	type AgentTeamExtensionRegistry,
	type TeamMemberTurnAttempt,
	type TeamSessionDocument,
	type TeamWorkItem,
} from "@vetta/agent-team";
import type { RuntimeHost } from "@vetta/runtime-core";
import { describe, expect, it, vi } from "vitest";
import type { TeamCollaborationStore } from "./team-collaboration-store.js";
import type { TeamSessionEventHub } from "./team-session-event-hub.js";
import type { TeamSessionStateRepository } from "./team-session-state-repository.js";
import { TeamTurnCoordinator } from "./team-turn-coordinator.js";

const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock("../logger.js", () => ({
	getAppLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: logError }),
}));

describe("TeamTurnCoordinator", () => {
	it("does not wake a task initiator after the user stopped the team", async () => {
		const deliverSessionContext = vi.fn(async () => undefined);
		const runtime = {
			deliverSessionContext,
			readSessionDocument: () => ({ entries: [] }),
		} as unknown as RuntimeHost;
		const completedWorkItem: TeamWorkItem = {
			id: "work-1",
			requestTurnId: "request-1",
			createdByParticipantId: "leader",
			assignedToParticipantId: "member",
			objective: "complete work",
			contextEntryIds: [],
			state: "completed",
			resultMessageId: "result-1",
			currentAttemptId: "attempt-1",
			createdAt: 1,
			updatedAt: 2,
			revision: 2,
		};
		const collaborationStore = {
			settle: vi.fn(async () => completedWorkItem),
		} as unknown as TeamCollaborationStore;
		const sessionState = {
			get: () => undefined,
			values: () => [],
		} as unknown as TeamSessionStateRepository;
		const coordinator = new TeamTurnCoordinator({
			runtime: () => runtime,
			extensions: {} as AgentTeamExtensionRegistry,
			collaborationStore,
			sessionState,
			eventHub: {} as TeamSessionEventHub,
			readSession: async () => session,
			readDocument: async () => ({
				schemaVersion: AGENT_TEAM_SCHEMA_VERSION,
				revision: 0,
				agents: [],
				teams: [],
			}),
			observations: () => undefined,
			publishSessionUpdated: () => undefined,
		});

		await coordinator.abort(session.id);
		await coordinator.settleMemberAttempt(
			session,
			{ ...completedWorkItem, state: "running", resultMessageId: undefined, revision: 1 },
			attempt,
			{ state: "completed" },
			"result-1",
		);

		expect(deliverSessionContext).not.toHaveBeenCalled();
	});

	it("logs a readable diagnosis when a send fails with a bare error object (BUG-0117)", async () => {
		const coordinator = new TeamTurnCoordinator({
			runtime: () => ({}) as RuntimeHost,
			extensions: {} as AgentTeamExtensionRegistry,
			collaborationStore: {} as TeamCollaborationStore,
			sessionState: {
				get: () => undefined,
				values: () => [],
			} as unknown as TeamSessionStateRepository,
			eventHub: {} as TeamSessionEventHub,
			readSession: async () => {
				throw { code: "SESSION_NOT_FOUND", message: "Session not found: member-1", retryable: false };
			},
			readDocument: async () => ({
				schemaVersion: AGENT_TEAM_SCHEMA_VERSION,
				revision: 0,
				agents: [],
				teams: [],
			}),
			observations: () => undefined,
			publishSessionUpdated: () => undefined,
		});
		const input = { requestId: "req-bug117", text: "hello" } as unknown as Parameters<TeamTurnCoordinator["send"]>[1];

		await expect(coordinator.send("team-bug117", input)).rejects.toMatchObject({
			code: "SESSION_NOT_FOUND",
		});

		const failureCall = logError.mock.calls.find(([message]) => message === "team message failed");
		expect(failureCall).toBeDefined();
		const fields = failureCall?.[1] as { error: string };
		expect(fields.error).not.toContain("[object Object]");
		expect(fields.error).toContain("SESSION_NOT_FOUND");
		expect(fields.error).toContain("Session not found: member-1");
	});

	it("rejects a delegation whose session lookup finishes after the user stopped the team", async () => {
		let releaseRead!: () => void;
		const readStarted = deferred();
		const readSession = vi.fn(async () => {
			readStarted.resolve();
			await new Promise<void>((resolve) => {
				releaseRead = resolve;
			});
			return session;
		});
		const enqueueAssignment = vi.fn();
		const collaborationStore = {
			enqueueAssignment,
			cancelForTeamStop: vi.fn(async () => undefined),
			append: vi.fn(async () => undefined),
		} as unknown as TeamCollaborationStore;
		const runtime = {
			abort: vi.fn(async () => undefined),
			hasSessionExtension: vi.fn(() => false),
		} as unknown as RuntimeHost;
		const coordinator = new TeamTurnCoordinator({
			runtime: () => runtime,
			extensions: {
				orchestrationPolicies: new Map([
					[
						"leader-delegates-v1",
						{
							id: "leader-delegates-v1",
							resolveTargets: () => [],
						},
					],
				]),
			} as unknown as AgentTeamExtensionRegistry,
			collaborationStore,
			sessionState: {
				get: () => session,
				values: () => [session],
			} as unknown as TeamSessionStateRepository,
			eventHub: {} as TeamSessionEventHub,
			readSession,
			readDocument: async () => ({
				schemaVersion: AGENT_TEAM_SCHEMA_VERSION,
				revision: 0,
				agents: [],
				teams: [],
			}),
			observations: () => undefined,
			publishSessionUpdated: () => undefined,
		});
		const delegation = coordinator.taskControls(session.id).delegateTask({
			sourceRuntimeSessionId: "leader-runtime",
			sourceTurnId: "leader-turn",
			toolCallId: "delegate-call",
			signal: new AbortController().signal,
			requestId: "late-delegation",
			targetHandle: "member",
			objective: "must not be admitted",
		});
		await readStarted.promise;

		await coordinator.abort(session.id);
		releaseRead();

		await expect(delegation).rejects.toThrow("stopped");
		expect(enqueueAssignment).not.toHaveBeenCalled();
	});

	// 回归 BUG-0108 路径 A：协调会话已被删除时 STOP 标记本来就写不进去，旧实现让这个
	// 持久化失败 reject 整个 abort()，再穿出 deleteSession 变成用户可见的删除失败。
	it("协调会话写 STOP 标记失败时 abort 仍完成，不让清理失败掀翻 stop/delete", async () => {
		const append = vi.fn(async () => {
			throw Object.assign(new Error("Session not found: coordination"), { code: "SESSION_NOT_FOUND" });
		});
		const collaborationStore = {
			append,
			readDocument: () => ({ entries: [] }),
			read: () => ({ workItems: [] }),
			cancelForTeamStop: vi.fn(async () => {}),
		} as unknown as TeamCollaborationStore;
		const runtime = {
			abort: vi.fn(async () => {}),
			readSessionDocument: () => ({ entries: [] }),
		} as unknown as RuntimeHost;
		const coordinator = new TeamTurnCoordinator({
			runtime: () => runtime,
			extensions: {} as AgentTeamExtensionRegistry,
			collaborationStore,
			sessionState: { get: () => session, values: () => [session] } as unknown as TeamSessionStateRepository,
			eventHub: {} as TeamSessionEventHub,
			readSession: async () => session,
			readDocument: async () => ({
				schemaVersion: AGENT_TEAM_SCHEMA_VERSION,
				revision: 0,
				agents: [],
				teams: [],
			}),
			observations: () => undefined,
			publishSessionUpdated: () => undefined,
		});

		await expect(coordinator.abort(session.id)).resolves.toBeUndefined();
		expect(append).toHaveBeenCalled();
	});
});

const session: TeamSessionDocument = {
	schemaVersion: AGENT_TEAM_SCHEMA_VERSION,
	revision: 1,
	id: "team-session",
	teamId: "team",
	name: "Team",
	cwd: "C:/workspace",
	leaderMemberId: "leader",
	memberHandles: { leader: "leader", member: "member" },
	createdAt: 1,
	updatedAt: 1,
	coordinationRuntime: { sessionId: "coordination", sessionPath: "C:/coordination.jsonl" },
	events: [],
	memberRuntime: {
		leader: {
			sessionId: "leader-runtime",
			sessionPath: "C:/leader.jsonl",
			agentProfileRevision: 1,
			deliveredEventIds: [],
		},
		member: {
			sessionId: "member-runtime",
			sessionPath: "C:/member.jsonl",
			agentProfileRevision: 1,
			deliveredEventIds: [],
		},
	},
};

const attempt: TeamMemberTurnAttempt = {
	id: "attempt-1",
	workItemId: "work-1",
	participantConversationId: "member-runtime",
	sourceTurnId: "member-turn",
	attempt: 1,
	mode: "initial",
	state: "running",
	lastProgressAt: 1,
};

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
