import type { TeamSessionActivity } from "@vetta/agent-team";
import type { AssistantMessage } from "@vetta/ai";
import type { HistoryEntry } from "@vetta/runtime-core";
import { describe, expect, it } from "vitest";
import {
	projectMemberUsage,
	projectTeamSessionProgress,
	type TeamSessionPhase,
	type TeamWorkItemPhase,
} from "./team-session-progress";
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
		expect(progress?.rows.map((row) => row.memberId)).toEqual(["leader", "developer", "reviewer"]);
		expect(progress?.rows.find((row) => row.memberId === "reviewer")?.openable).toBe(false);
	});

	it("keeps members with no delegated work as not-started rows instead of hiding them", () => {
		const progress = project([activity("developer", "running")]);
		const leaderRow = progress?.rows.find((row) => row.memberId === "leader");
		expect(leaderRow).toMatchObject({ isLeader: true, itemCount: 0 });
		expect(leaderRow?.state).toBeUndefined();
	});

	it.each<{ readonly state: TeamSessionActivity["state"]; readonly row: TeamWorkItemPhase }>([
		{ state: "attention-required", row: "attention" },
		{ state: "waiting", row: "waiting" },
		{ state: "failed", row: "failed" },
	])("keeps work item state $state on the member row", ({ state, row }) => {
		const progress = project([activity("developer", state)]);
		expect(progress?.rows.find((item) => item.memberId === "developer")?.state).toBe(row);
	});

	it("attaches member usage and session totals without inventing data for missing runtimes", () => {
		const progress = projectTeamSessionProgress({
			activities: [activity("developer", "running")],
			members: [leader, developer, reviewer],
			leaderMemberId: "leader",
			memberRuntimeIds: { leader: "leader-rt", developer: "dev-rt" },
			leaderBusy: false,
			memberUsages: {
				developer: { rounds: 2, toolCalls: 3, inputTokens: 1200, outputTokens: 300, durationMs: 5000 },
				leader: { rounds: 1, toolCalls: 0, inputTokens: 4000, outputTokens: 150, durationMs: 1000 },
			},
			contextPercentByMember: { developer: 42, leader: null },
		});
		expect(progress?.rows.find((row) => row.memberId === "developer")).toMatchObject({
			usage: { inputTokens: 1200, outputTokens: 300 },
			contextPercent: 42,
		});
		expect(progress?.rows.find((row) => row.memberId === "reviewer")?.usage).toBeUndefined();
		expect(progress?.totals).toEqual({
			rounds: 3,
			toolCalls: 3,
			inputTokens: 5200,
			outputTokens: 450,
			durationMs: 6000,
		});
	});
});

function assistantMessage(usage: { input: number; output: number }, toolCalls = 0): AssistantMessage {
	return {
		role: "assistant",
		content: [
			{ type: "text", text: "step" },
			...Array.from({ length: toolCalls }, (_, index) => ({
				type: "toolCall" as const,
				id: `call-${index}`,
				name: "read",
				arguments: {},
			})),
		],
		api: "test",
		provider: "test",
		model: "test",
		usage: {
			input: usage.input,
			output: usage.output,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: 1,
	};
}

describe("projectMemberUsage", () => {
	it("aggregates rounds, tool calls, tokens and busy time from persisted history", () => {
		const history: HistoryEntry[] = [
			{
				type: "message",
				message: { role: "user", content: "委托任务", timestamp: 1 },
			},
			{ type: "message", message: assistantMessage({ input: 1000, output: 200 }, 2) },
			{
				type: "tool_timing",
				toolCallId: "call-0",
				toolName: "read",
				startedAt: 1,
				durationMs: 500,
				phases: [],
				timestamp: "t",
			},
			{
				type: "assistant_turn_timing",
				timing: { startedAt: 1, endedAt: 2001, durationMs: 2000 },
				timestamp: "t",
			},
			{ type: "message", message: assistantMessage({ input: 500, output: 100 }) },
			{
				type: "assistant_turn_timing",
				timing: { startedAt: 2001, endedAt: 5001, durationMs: 3000 },
				timestamp: "t",
			},
		];
		expect(projectMemberUsage(history)).toEqual({
			rounds: 2,
			toolCalls: 2,
			inputTokens: 1500,
			outputTokens: 300,
			durationMs: 5500,
		});
	});

	it("returns an all-zero aggregate for a member that has not started", () => {
		const history: HistoryEntry[] = [
			{ type: "message", message: { role: "user", content: "启动提示词", timestamp: 1 } },
		];
		expect(projectMemberUsage(history)).toEqual({
			rounds: 0,
			toolCalls: 0,
			inputTokens: 0,
			outputTokens: 0,
			durationMs: 0,
		});
	});
});
