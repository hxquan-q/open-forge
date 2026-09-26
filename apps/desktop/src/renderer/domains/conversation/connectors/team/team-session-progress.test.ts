import type { TeamSessionActivity } from "@vetta/agent-team";
import { describe, expect, it } from "vitest";
import { projectTeamSessionProgress, type TeamSessionPhase, type TeamWorkItemPhase } from "./team-session-progress";
import type { TeamMemberViewModel } from "./teamChatModel";

const leader: TeamMemberViewModel = {
	id: "leader",
	kind: "agent",
	name: "Vetta",
	handle: "vetta",
	blueprintId: "leader",
	selected: false,
	status: "idle",
};
const developer: TeamMemberViewModel = {
	...leader,
	id: "developer",
	name: "Dev",
	handle: "developer",
	blueprintId: "developer",
};
const reviewer: TeamMemberViewModel = {
	...leader,
	id: "reviewer",
	name: "Review",
	handle: "reviewer",
	blueprintId: "reviewer",
};

function activity(
	targetMemberId: string,
	state: TeamSessionActivity["state"],
	objective = `task for ${targetMemberId}`,
	timestamp = 1,
): TeamSessionActivity {
	return {
		kind: "delegation",
		id: `item-${targetMemberId}-${timestamp}`,
		requestId: `request-${targetMemberId}`,
		sourceMemberId: "leader",
		targetMemberId,
		objective,
		state,
		timestamp,
	};
}

function project(activities: readonly TeamSessionActivity[], { leaderBusy = false }: { leaderBusy?: boolean } = {}) {
	return projectTeamSessionProgress({
		activities,
		members: [leader, developer, reviewer],
		leaderMemberId: "leader",
		memberRuntimeIds: { leader: "leader-rt", developer: "dev-rt" },
		leaderBusy,
	});
}

describe("projectTeamSessionProgress", () => {
	it("returns null before any work item exists so the strip stays hidden", () => {
		expect(project([])).toBeNull();
	});

	// 团队级阶段只看持久化 work item 的最强状态，不引入第二套状态机。
	it.each<{
		readonly states: readonly TeamSessionActivity["state"][];
		readonly phase: TeamSessionPhase;
		readonly leaderBusy?: boolean;
	}>([
		{ states: ["queued"], phase: "dispatching" },
		{ states: ["queued", "queued"], phase: "dispatching" },
		{ states: ["queued", "running"], phase: "running" },
		{ states: ["running"], phase: "running" },
		{ states: ["waiting"], phase: "waiting" },
		{ states: ["waiting", "running"], phase: "running" },
		{ states: ["attention-required"], phase: "attention" },
		{ states: ["attention-required", "running"], phase: "attention" },
		{ states: ["completed"], phase: "settled" },
		{ states: ["completed", "failed"], phase: "settled" },
		{ states: ["completed"], phase: "wrapping", leaderBusy: true },
		{ states: ["completed", "cancelled"], phase: "wrapping", leaderBusy: true },
	])("projects states %j as phase $phase", ({ states, phase, leaderBusy = false }) => {
		const progress = project(
			states.map((state, index) => activity("developer", state, "目标", index + 1)),
			{
				leaderBusy,
			},
		);
		expect(progress?.phase).toBe(phase);
		expect(progress?.total).toBe(states.length);
	});

	it("normalizes the durable attention-required state into the attention phase and count", () => {
		const progress = project([activity("developer", "attention-required")]);
		expect(progress?.phase).toBe("attention");
		expect(progress?.counts.attention).toBe(1);
		expect(progress?.activeCount).toBe(1);
	});

	it("counts terminal items separately so the summary keeps finished work visible", () => {
		const progress = project([
			activity("developer", "completed", "done earlier", 1),
			activity("developer", "running", "still working", 2),
			activity("reviewer", "failed", "broke", 3),
		]);
		expect(progress?.counts).toMatchObject({ completed: 1, running: 1, failed: 1 });
		expect(progress?.activeCount).toBe(1);
	});

	it("maps the dominant item's objective onto each member row", () => {
		const progress = project([
			activity("developer", "completed", "第一步已完成", 1),
			activity("developer", "running", "   正在\n写页面   ", 2),
			activity("reviewer", "queued", "等待审计", 3),
		]);
		const devRow = progress?.rows.find((row) => row.memberId === "developer");
		// 成员行按优先级取最强状态：running 盖过 completed。
		expect(devRow).toMatchObject({ state: "running", objective: "正在 写页面", itemCount: 2 });
		const reviewRow = progress?.rows.find((row) => row.memberId === "reviewer");
		expect(reviewRow).toMatchObject({ state: "queued", objective: "等待审计" });
	});

	it("keeps roster order and marks rows openable only when a member session exists", () => {
		const progress = project([activity("developer", "running"), activity("reviewer", "waiting")]);
		expect(progress?.rows.map((row) => row.memberId)).toEqual(["developer", "reviewer"]);
		expect(progress?.rows.find((row) => row.memberId === "reviewer")?.openable).toBe(false);
	});

	it("omits members with no work items so the leader does not appear until delegated work exists", () => {
		const progress = project([activity("developer", "running")]);
		expect(progress?.rows.map((row) => row.memberId)).toEqual(["developer"]);
		expect(progress?.rows.every((row) => !row.isLeader)).toBe(true);
	});

	it.each<{ readonly state: TeamSessionActivity["state"]; readonly row: TeamWorkItemPhase }>([
		{ state: "attention-required", row: "attention" },
		{ state: "waiting", row: "waiting" },
		{ state: "failed", row: "failed" },
	])("keeps work item state $state on the member row", ({ state, row }) => {
		const progress = project([activity("developer", state)]);
		expect(progress?.rows[0]?.state).toBe(row);
	});
});
