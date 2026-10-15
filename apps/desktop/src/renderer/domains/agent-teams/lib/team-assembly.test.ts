import type { AgentProfile, TeamDefinition } from "@vetta/agent-team";
import { describe, expect, it } from "vitest";
import {
	assemblyBaseline,
	assemblyDraftFromTeam,
	buildCreateTeamInput,
	buildUpdateTeamInput,
	canSubmitAssembly,
	emptyAssemblyDraft,
	sameAssemblyDraft,
	setAssemblyAssignment,
	toggleAssemblyMember,
} from "./team-assembly";

function agent(id: string, mentionHandle = id): AgentProfile {
	return {
		id,
		revision: 1,
		name: id,
		description: "",
		mentionHandle,
		blueprintId: "builder",
		abilities: { skills: [], mcpServers: [], plugins: [] },
		scope: { kind: "library" },
		createdAt: 1,
		updatedAt: 1,
	};
}

const team: TeamDefinition = {
	id: "team",
	revision: 4,
	name: "Existing",
	description: "desc",
	leaderMemberId: "member-b",
	members: [
		{ id: "member-a", handle: "a", binding: { kind: "reference", agentProfileId: "a" } },
		{ id: "member-b", handle: "b", binding: { kind: "reference", agentProfileId: "b" } },
	],
	orchestrationPolicyId: "default",
	contextPolicyId: "default",
	createdAt: 1,
	updatedAt: 1,
};

describe("team assembly draft", () => {
	it("makes the first recruit the leader and hands the crown over when that member leaves", () => {
		const first = toggleAssemblyMember(emptyAssemblyDraft(), "a");
		expect(first.leaderId).toBe("a");

		const second = toggleAssemblyMember(first, "b");
		expect(second.leaderId).toBe("a");

		const withoutLeader = toggleAssemblyMember(second, "a");
		expect(withoutLeader.memberIds).toEqual(["b"]);
		expect(withoutLeader.leaderId).toBe("b");
	});

	it("requires both a name and at least one member before it can be saved", () => {
		expect(canSubmitAssembly({ name: "  ", memberIds: ["a"] })).toBe(false);
		expect(canSubmitAssembly({ name: "Team", memberIds: [] })).toBe(false);
		expect(canSubmitAssembly({ name: "Team", memberIds: ["a"] })).toBe(true);
	});

	it("reads an existing team into a draft with the leader resolved to its Agent", () => {
		expect(assemblyDraftFromTeam(team)).toEqual({
			maxAutomaticRetries: 2,
			teamId: "team",
			name: "Existing",
			description: "desc",
			memberIds: ["a", "b"],
			leaderId: "b",
			assignments: {},
			handles: { a: "a", b: "b" },
		});
	});

	it("reads team assignments back into the draft by Agent identity", () => {
		const assigned: TeamDefinition = {
			...team,
			members: [{ ...team.members[0], assignment: { responsibility: "Owns review" } }, ...team.members.slice(1)],
		};

		expect(assemblyDraftFromTeam(assigned).assignments).toEqual({ a: { responsibility: "Owns review" } });
	});

	it("drops an assignment from the draft once both fields are blank", () => {
		const draft = setAssemblyAssignment(
			{ name: "Team", memberIds: ["a"], assignments: { a: { responsibility: "Owns review" } } },
			"a",
			{ responsibility: "  ", instructions: "" },
		);

		expect(draft.assignments).toEqual({});
	});

	it("trims an assignment before it reaches the draft", () => {
		const draft = setAssemblyAssignment({ name: "Team", memberIds: ["a"] }, "a", {
			responsibility: "  Owns review  ",
			instructions: "   ",
		});

		expect(draft.assignments).toEqual({ a: { responsibility: "Owns review" } });
	});
});

describe("assembly dirty tracking", () => {
	it("treats a fresh create draft and a replayed edit draft as clean", () => {
		// 新建草稿的种子就是空草稿；编辑草稿的种子是按团队重放的快照，二者都不该弹丢弃确认。
		expect(sameAssemblyDraft(emptyAssemblyDraft(), emptyAssemblyDraft())).toBe(true);
		expect(sameAssemblyDraft(assemblyDraftFromTeam(team), assemblyDraftFromTeam(team))).toBe(true);

		expect(assemblyBaseline(emptyAssemblyDraft(), [team])).toEqual(emptyAssemblyDraft());
		expect(assemblyBaseline(assemblyDraftFromTeam(team), [team])).toEqual(assemblyDraftFromTeam(team));
		// 种子找不到对应团队（已被删除）时按脏处理，交给确认而不是静默丢。
		expect(assemblyBaseline(assemblyDraftFromTeam(team), [])).toBeUndefined();
	});

	it("marks whitespace-only edits as clean but real edits as dirty", () => {
		const baseline = emptyAssemblyDraft();
		expect(sameAssemblyDraft({ name: "   ", memberIds: [] }, baseline)).toBe(true);
		expect(sameAssemblyDraft({ name: "Squad", memberIds: [] }, baseline)).toBe(false);
		expect(sameAssemblyDraft(toggleAssemblyMember(baseline, "a"), baseline)).toBe(false);
	});

	it("detects roster, leader and assignment edits on an existing team draft", () => {
		const baseline = assemblyDraftFromTeam(team);
		expect(sameAssemblyDraft({ ...baseline, leaderId: "a" }, baseline)).toBe(false);
		expect(sameAssemblyDraft({ ...baseline, memberIds: ["a"] }, baseline)).toBe(false);
		expect(
			sameAssemblyDraft(
				setAssemblyAssignment(baseline, "a", { responsibility: "Owns review", instructions: "" }),
				baseline,
			),
		).toBe(false);
		// 任务书写回与基线一致的内容不算改动。
		expect(sameAssemblyDraft({ ...baseline, handles: { a: "a", b: "b" } }, baseline)).toBe(true);
	});
});

describe("team assembly submission", () => {
	const agentsById = new Map([
		["a", agent("a", "shared")],
		["b", agent("b", "shared")],
	]);

	it("carries the chosen automatic recovery limit through create and update", () => {
		const draft = { ...assemblyDraftFromTeam(team), maxAutomaticRetries: 0 };
		const agents = [agent("a"), agent("b")];
		expect(buildCreateTeamInput(draft, new Map(agents.map((agent) => [agent.id, agent]))).maxAutomaticRetries).toBe(
			0,
		);
		expect(
			buildUpdateTeamInput(draft, team, new Map(agents.map((agent) => [agent.id, agent]))).maxAutomaticRetries,
		).toBe(0);
	});

	it("creates a team with unique member handles and a single leader", () => {
		const input = buildCreateTeamInput({ name: " Squad ", memberIds: ["a", "b"], leaderId: "b" }, agentsById);
		expect(input.name).toBe("Squad");
		expect(input.members).toEqual([
			{ agentProfileId: "a", handle: "shared", bindingKind: "reference", leader: false },
			{ agentProfileId: "b", handle: "shared-2", bindingKind: "reference", leader: true },
		]);

		const copied = buildCreateTeamInput(
			{ name: "Squad", memberIds: ["a"], leaderId: "a", bindingKinds: { a: "copy" } },
			agentsById,
		);
		expect(copied.members[0]?.bindingKind).toBe("copy");
	});

	it("keeps existing member bindings and only adds the newly recruited Agents", () => {
		const agentsWithNewcomer = new Map(agentsById).set("c", agent("c"));
		const input = buildUpdateTeamInput(
			{ teamId: "team", name: "Existing", memberIds: ["b", "c"], leaderId: "c" },
			team,
			agentsWithNewcomer,
		);
		expect(input.expectedRevision).toBe(4);
		expect(input.description).toBe("desc");
		// 改团队时每位成员都带上任务书，空对象即「清空」；省略会被主进程读成「本次没碰」。
		expect(input.members).toEqual([
			{ kind: "existing", memberId: "member-b", leader: false, assignment: {} },
			{ kind: "new", agentProfileId: "c", bindingKind: "reference", leader: true, assignment: {} },
		]);
	});

	it("carries a drafted assignment into the update input", () => {
		const input = buildUpdateTeamInput(
			{
				teamId: "team",
				name: "Existing",
				memberIds: ["a", "b"],
				leaderId: "b",
				assignments: { a: { responsibility: "Owns review" } },
			},
			team,
			agentsById,
		);

		expect(input.members[0]).toEqual({
			kind: "existing",
			memberId: "member-a",
			leader: false,
			assignment: { responsibility: "Owns review" },
		});
	});

	it("carries a drafted handle into the update input only when it actually changes", () => {
		const base = { teamId: "team", name: "Existing", memberIds: ["a", "b"], leaderId: "b" };

		// 与现值相同（含仅首尾空格差异）或空白都不携带：省略在协议里表示「本次没碰称呼」。
		const untouched = buildUpdateTeamInput({ ...base, handles: { a: "  a  " } }, team, agentsById);
		expect(untouched.members[0]).not.toHaveProperty("handle");

		const blanked = buildUpdateTeamInput({ ...base, handles: { a: "   " } }, team, agentsById);
		expect(blanked.members[0]).not.toHaveProperty("handle");

		const renamed = buildUpdateTeamInput({ ...base, handles: { a: "reviewer" } }, team, agentsById);
		expect(renamed.members[0]).toMatchObject({ memberId: "member-a", handle: "reviewer" });
		// 其他成员不受牵连：b 没改名就不携带。
		expect(renamed.members[1]).not.toHaveProperty("handle");
	});

	it("falls back to the first member when the recorded leader was released", () => {
		const input = buildCreateTeamInput({ name: "Squad", memberIds: ["a", "b"], leaderId: "gone" }, agentsById);
		expect(input.members.map((member) => member.leader)).toEqual([true, false]);
	});
});
