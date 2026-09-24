// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	markTeamMemberContextDelivered,
	teamMemberAssignmentFingerprint,
	windowTeamDeliveredEventIds,
} from "../src/context-projector.js";
import {
	createLegacyTeamMemberDelegationEvent,
	createLegacyTeamMemberResultEvent,
	createLegacyTeamUserMessageEvent,
} from "../src/legacy-events.js";

describe("Team context cursor and legacy identities", () => {
	it("keeps schema-v1 migration identities deterministic", () => {
		const first = createLegacyTeamUserMessageEvent({
			teamSessionId: "session",
			requestId: "request",
			text: "first",
			targetMemberIds: ["leader"],
			timestamp: 1,
		});
		const replay = createLegacyTeamUserMessageEvent({
			teamSessionId: "session",
			requestId: "request",
			text: "changed migration payload",
			targetMemberIds: [],
			timestamp: 99,
		});
		expect(replay.id).toBe(first.id);
	});

	it("updates a member cursor without appending a legacy event", () => {
		const delegation = createLegacyTeamMemberDelegationEvent({
			teamSessionId: "session",
			requestId: "delegation",
			sourceMemberId: "leader",
			targetMemberId: "builder",
			objective: "Build it",
			timestamp: 2,
		});
		const result = createLegacyTeamMemberResultEvent({
			teamSessionId: "session",
			requestId: "delegation",
			memberId: "builder",
			sourceTurnId: "builder-turn",
			text: "Built",
			timestamp: 3,
		});
		const session = {
			schemaVersion: 1 as const,
			revision: 3,
			id: "session",
			teamId: "team",
			name: "Team",
			cwd: "C:/workspace",
			leaderMemberId: "leader",
			memberHandles: { leader: "leader", builder: "builder" },
			createdAt: 1,
			updatedAt: 3,
			events: [delegation, result],
			memberRuntime: {
				leader: {
					sessionId: "leader-runtime",
					sessionPath: "C:/leader.jsonl",
					agentProfileRevision: 1,
					deliveredEventIds: [],
				},
				builder: {
					sessionId: "builder-runtime",
					sessionPath: "C:/builder.jsonl",
					agentProfileRevision: 1,
					deliveredEventIds: [delegation.id],
				},
			},
		};

		const completed = markTeamMemberContextDelivered({
			session,
			memberId: "leader",
			deliveredEventIds: [result.id, result.id],
			timestamp: 4,
		});

		expect(completed.events).toEqual(session.events);
		expect(completed.memberRuntime.leader?.deliveredEventIds).toEqual([result.id]);
		expect(completed.revision).toBe(4);
	});
});

describe("teamMemberAssignmentFingerprint", () => {
	it("changes with the assignment and stays undefined without one", () => {
		expect(teamMemberAssignmentFingerprint(undefined)).toBeUndefined();
		expect(teamMemberAssignmentFingerprint({})).toBeUndefined();
		const first = teamMemberAssignmentFingerprint({ responsibility: "Owns review" });
		expect(first).toBe(teamMemberAssignmentFingerprint({ responsibility: "Owns review" }));
		expect(first).not.toBe(teamMemberAssignmentFingerprint({ responsibility: "Owns delivery" }));
		expect(first).not.toBe(
			teamMemberAssignmentFingerprint({ responsibility: "Owns review", instructions: "Escalate." }),
		);
	});
});

describe("deliveredEventIds 写入侧窗口", () => {
	const session = {
		schemaVersion: 1 as const,
		revision: 7,
		id: "session",
		teamId: "team",
		name: "Team",
		cwd: "C:/workspace",
		leaderMemberId: "leader",
		memberHandles: { leader: "leader" },
		createdAt: 1,
		updatedAt: 7,
		events: [],
		memberRuntime: {
			leader: {
				sessionId: "leader-runtime",
				sessionPath: "C:/leader.jsonl",
				agentProfileRevision: 1,
				deliveredEventIds: [],
			},
		},
	};

	it("markTeamMemberContextDelivered 把回执裁到最近 256 条并保留尾部", () => {
		const batch = Array.from({ length: 300 }, (_, index) => `event-${index}`);
		const completed = markTeamMemberContextDelivered({
			session,
			memberId: "leader",
			deliveredEventIds: batch,
			timestamp: 8,
		});
		const runtime = completed.memberRuntime.leader;
		if (!runtime) throw new Error("missing leader runtime");
		expect(runtime.deliveredEventIds.length).toBe(256);
		expect(runtime.deliveredEventIds[0]).toBe("event-44");
		expect(runtime.deliveredEventIds.at(-1)).toBe("event-299");
		expect(completed.revision).toBe(8);
	});

	it("windowTeamDeliveredEventIds 去重保序、可注入更小窗口", () => {
		expect(windowTeamDeliveredEventIds(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
		expect(windowTeamDeliveredEventIds([], ["x", "x"])).toEqual(["x"]);
		expect(windowTeamDeliveredEventIds(["a", "b", "c"], ["d"], 3)).toEqual(["b", "c", "d"]);
	});
});
