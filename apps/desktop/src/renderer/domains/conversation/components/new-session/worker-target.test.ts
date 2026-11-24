// Modified by The Open Forge contributors.
import type { AgentProfile, AgentTeamDocument, TeamDefinition } from "@vetta/agent-team";
import { describe, expect, it } from "vitest";
import { isWorkerAgent, isWorkerTeam } from "./worker-target";

function profile(id: string, lifecycle?: "resident" | "oneshot"): AgentProfile {
	return {
		id,
		revision: 1,
		name: id,
		description: "",
		mentionHandle: id,
		blueprintId: `bp-${id}`,
		systemPrompt: "persona",
		abilities: { selectionMode: "custom", skills: [], mcpServers: [], plugins: [] },
		scope: { kind: "library" },
		...(lifecycle ? { lifecycle } : {}),
		createdAt: 0,
		updatedAt: 0,
	};
}

function teamWithLeader(leader: AgentProfile, others: readonly AgentProfile[] = []): AgentTeamDocument {
	const members = [
		{ id: "member-leader", handle: "lead", binding: { kind: "reference" as const, agentProfileId: leader.id } },
		...others.map((other, index) => ({
			id: `member-${index}`,
			handle: other.id,
			binding: { kind: "reference" as const, agentProfileId: other.id },
		})),
	];
	const team: TeamDefinition = {
		id: "team-1",
		revision: 1,
		name: "Team",
		description: "",
		leaderMemberId: "member-leader",
		members,
		orchestrationPolicyId: "leader-delegates-v1",
		contextPolicyId: "public-results-v1",
		createdAt: 0,
		updatedAt: 0,
	};
	return { schemaVersion: 1, revision: 1, agents: [leader, ...others], teams: [team] } as AgentTeamDocument;
}

describe("worker target classification", () => {
	it("marks a team worker crew only when the leader profile carries a lifecycle mark", () => {
		expect(isWorkerTeam(teamWithLeader(profile("lead", "resident")), "team-1")).toBe(true);
		expect(isWorkerTeam(teamWithLeader(profile("lead")), "team-1")).toBe(false);
	});

	it("classifies single agents by their own mark", () => {
		const document = teamWithLeader(profile("lead"), [profile("worker", "oneshot")]);
		expect(isWorkerAgent(document, "worker")).toBe(true);
		expect(isWorkerAgent(document, "lead")).toBe(false);
	});

	it("falls back to controller semantics (status quo) for missing documents, teams or profiles", () => {
		expect(isWorkerTeam(undefined, "team-1")).toBe(false);
		expect(isWorkerTeam(teamWithLeader(profile("lead", "resident")), "missing")).toBe(false);
		expect(isWorkerAgent(undefined, "any")).toBe(false);
		expect(isWorkerAgent(teamWithLeader(profile("lead")), null)).toBe(false);
		const document = teamWithLeader(profile("lead"));
		expect(isWorkerAgent(document, "ghost")).toBe(false);
	});
});
