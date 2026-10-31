// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { createAgentTeamFixture } from "../src/fixtures.js";
import {
	parseAgentTeamDocument,
	parseCreateAgentProfileInput,
	parseCreateTeamInput,
	parseDeleteAgentProfileInput,
	parseDeleteTeamInput,
	parseSendTeamMessageInput,
	parseTeamSessionDocument,
	parseUpdateAgentProfileInput,
	parseUpdateTeamInput,
	parseUpdateTeamSessionModelSettingsInput,
} from "../src/validation.js";

describe("Agent Team IPC input validation", () => {
	it("validates optional automatic recovery limits without breaking legacy definitions", () => {
		const input = {
			expectedRevision: 1,
			name: "Team",
			description: "",
			members: [{ kind: "existing", memberId: "member", leader: true }],
		};
		for (const limit of [0, 2, 10])
			expect(parseUpdateTeamInput({ ...input, maxAutomaticRetries: limit }).maxAutomaticRetries).toBe(limit);
		for (const limit of [-1, 11, 1.5, "2", null])
			expect(() => parseUpdateTeamInput({ ...input, maxAutomaticRetries: limit })).toThrow();
		expect(parseUpdateTeamInput(input).maxAutomaticRetries).toBeUndefined();
		const document = createAgentTeamFixture();
		expect(parseAgentTeamDocument(document)).toEqual(document);
	});

	it("accepts complete profile and team inputs", () => {
		expect(
			parseCreateAgentProfileInput({
				name: "Researcher",
				mentionHandle: "researcher",
				blueprintId: "researcher",
				abilities: { skills: ["search"] },
			}),
		).toMatchObject({ name: "Researcher", mentionHandle: "researcher" });
		expect(
			parseCreateTeamInput({
				name: "Product team",
				members: [
					{
						agentProfileId: "agent-1",
						handle: "leader",
						bindingKind: "reference",
						leader: true,
					},
				],
			}),
		).toMatchObject({ name: "Product team" });
	});

	it("accepts a team assignment on both new and existing members", () => {
		expect(
			parseUpdateTeamInput({
				expectedRevision: 1,
				name: "Product team",
				description: "",
				members: [
					{ kind: "existing", memberId: "member-1", leader: true, assignment: { responsibility: "Owns review" } },
					{
						kind: "new",
						agentProfileId: "agent-2",
						bindingKind: "reference",
						leader: false,
						assignment: { instructions: "Escalate schema changes." },
					},
				],
			}),
		).toMatchObject({ members: [{ assignment: { responsibility: "Owns review" } }, {}] });
	});

	it("accepts an in-team handle rename only on existing members", () => {
		const input = {
			expectedRevision: 1,
			name: "Product team",
			description: "",
			members: [{ kind: "existing", memberId: "member-1", leader: true }],
		} as const;

		// 已有成员可携带 handle 改队内称呼，省略表示保持现值。
		expect(parseUpdateTeamInput({ ...input, members: [{ ...input.members[0], handle: "reviewer" }] })).toMatchObject({
			members: [{ handle: "reviewer" }],
		});
		expect(parseUpdateTeamInput(input).members[0]).not.toHaveProperty("handle");

		// 空白称呼没有「清空」语义，进不了协议；新成员变体也不收 handle（入团时定）。
		expect(() => parseUpdateTeamInput({ ...input, members: [{ ...input.members[0], handle: "  " }] })).toThrow(
			"Invalid update team input",
		);
		expect(() =>
			parseUpdateTeamInput({
				...input,
				members: [
					{ kind: "new", agentProfileId: "agent-2", bindingKind: "reference", leader: false, handle: "late" },
				],
			}),
		).toThrow("Invalid update team input");
	});

	it("rejects a blank assignment inside a persisted document", () => {
		const document = createAgentTeamFixture();
		const team = document.teams[0];
		if (!team) throw new Error("Expected an initial team");
		const members = [{ ...team.members[0], assignment: { responsibility: "   " } }, ...team.members.slice(1)];

		// 空白等同缺省：只允许 Store 折算掉，不允许持久化成空串。
		expect(() => parseAgentTeamDocument({ ...document, teams: [{ ...team, members }] })).toThrow(
			"Invalid Agent Team configuration document",
		);
	});

	it("accepts file-defined identities when they provide their own system prompt", () => {
		const document = createAgentTeamFixture();
		const first = document.agents[0];
		if (!first) throw new Error("Expected an initial agent");

		const parsed = parseAgentTeamDocument({
			...document,
			agents: [
				{ ...first, blueprintId: "custom-coordinator", systemPrompt: "Coordinate this team." },
				...document.agents.slice(1),
			],
		});

		expect(parsed.agents[0]).toMatchObject({ blueprintId: "custom-coordinator" });
	});

	// 档位归属（TASK-0406）：档案与团队可选携带 mode，未知值仍 fail-closed。
	// 回归背景：reconcile 会把它写进文档，schema 不认识就会让整份配置读废——
	// 表现为两档的新会话选择器同时「列表加载失败」。
	it("accepts an optional workspace mode on profiles and teams and rejects unknown values", () => {
		const document = createAgentTeamFixture();
		const first = document.agents[0];
		const team = document.teams[0];
		if (!first || !team) throw new Error("Expected an initial agent and team");

		const parsed = parseAgentTeamDocument({
			...document,
			agents: [{ ...first, mode: "coding" }, ...document.agents.slice(1)],
			teams: [{ ...team, mode: "coding" }],
		});
		expect(parsed.agents[0]?.mode).toBe("coding");
		expect(parsed.teams[0]?.mode).toBe("coding");

		expect(() =>
			parseAgentTeamDocument({
				...document,
				agents: [{ ...first, mode: "dev" }, ...document.agents.slice(1)],
			}),
		).toThrow("Invalid Agent Team configuration document");
	});

	it("rejects unknown properties and invalid revisions", () => {
		expect(() =>
			parseUpdateAgentProfileInput({
				expectedRevision: 0,
				name: "Agent",
				description: "",
				mentionHandle: "agent",
				abilities: { skills: [], mcpServers: [], plugins: [] },
			}),
		).toThrow("Invalid update agent profile input");
		expect(() =>
			parseSendTeamMessageInput({
				requestId: "request-1",
				text: "Hello",
				targetMemberIds: [],
				privateTrace: true,
			}),
		).toThrow("Invalid send team message input");
	});

	it("accepts structured attachments and rejects an empty team request", () => {
		expect(
			parseSendTeamMessageInput({
				requestId: "request-attachments",
				text: "",
				targetMemberIds: [],
				attachments: [{ kind: "file", path: "C:/workspace/notes.txt" }],
			}),
		).toMatchObject({ attachments: [{ kind: "file", path: "C:/workspace/notes.txt" }] });
		expect(() =>
			parseSendTeamMessageInput({
				requestId: "request-empty",
				text: " ",
				targetMemberIds: [],
			}),
		).toThrow("Invalid send team message input");
	});

	it.each(["steer", "followUp"] as const)("accepts %s streaming behavior on team sends", (streamingBehavior) => {
		expect(
			parseSendTeamMessageInput({
				requestId: `request-${streamingBehavior}`,
				text: "Continue",
				targetMemberIds: [],
				streamingBehavior,
			}),
		).toMatchObject({ streamingBehavior });
	});

	it("validates Team-session model settings as a closed contract", () => {
		expect(parseUpdateTeamSessionModelSettingsInput({ modelKey: "openai/gpt-5", reasoning: "high" })).toEqual({
			modelKey: "openai/gpt-5",
			reasoning: "high",
		});
		expect(() => parseUpdateTeamSessionModelSettingsInput({ reasoning: "high" })).toThrow(
			"Invalid Team session model settings input",
		);
		expect(() => parseUpdateTeamSessionModelSettingsInput({ modelKey: "openai/gpt-5", privateTrace: true })).toThrow(
			"Invalid Team session model settings input",
		);
	});

	it("validates reviewed cascade deletion and atomic team roster updates", () => {
		expect(
			parseDeleteAgentProfileInput({
				expectedRevision: 2,
				expectedTeamIds: ["team-1", "team-2"],
				expectedTeamRevisions: { "team-1": 3, "team-2": 4 },
			}),
		).toEqual({
			expectedRevision: 2,
			expectedTeamIds: ["team-1", "team-2"],
			expectedTeamRevisions: { "team-1": 3, "team-2": 4 },
		});
		expect(parseDeleteTeamInput({ expectedRevision: 3 })).toEqual({ expectedRevision: 3 });
		expect(
			parseUpdateTeamInput({
				expectedRevision: 3,
				name: "Delivery",
				description: "",
				members: [
					{ kind: "existing", memberId: "member-1", leader: false },
					{ kind: "new", agentProfileId: "agent-2", bindingKind: "copy", leader: true },
				],
			}),
		).toMatchObject({ name: "Delivery", members: [{ kind: "existing" }, { kind: "new" }] });
		expect(() =>
			parseUpdateTeamInput({
				expectedRevision: 3,
				name: "Delivery",
				description: "",
				members: [],
			}),
		).toThrow("Invalid update team input");
	});

	it("rejects sessions whose runtime roster or events reference unknown members", () => {
		const session = {
			schemaVersion: 1,
			revision: 0,
			id: "session",
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
					sessionId: "runtime",
					sessionPath: "C:/sessions/runtime.jsonl",
					agentProfileRevision: 1,
					deliveredEventIds: [],
				},
			},
		};
		expect(parseTeamSessionDocument(session)).toMatchObject({ id: "session" });
		expect(parseTeamSessionDocument({ ...session, title: "Review deployment plan" })).toMatchObject({
			title: "Review deployment plan",
		});
		expect(() => parseTeamSessionDocument({ ...session, title: " " })).toThrow("Invalid Agent Team session document");
		expect(
			parseTeamSessionDocument({
				...session,
				workspaceId: `C:/${"nested/".repeat(50)}project`,
			}),
		).toMatchObject({ cwd: "C:/workspace" });
		expect(
			parseTeamSessionDocument({
				...session,
				workspaceKind: "session",
				workspaceId: "agent-team:team:session:workspace-a",
			}),
		).toMatchObject({ workspaceKind: "session" });
		expect(
			parseTeamSessionDocument({
				...session,
				memberRuntime: {
					leader: {
						...session.memberRuntime.leader,
						deliveredEventIds: ["ordinary-coordination-message"],
						sharedCheckpointId: "checkpoint-1",
					},
				},
			}),
		).toMatchObject({ id: "session" });
		expect(
			parseTeamSessionDocument({
				...session,
				activeMemberIds: ["leader"],
				memberHandles: { leader: "agent", "removed-member": "agent" },
			}),
		).toMatchObject({ id: "session" });
		expect(
			parseTeamSessionDocument({
				...session,
				activeMemberIds: ["leader"],
				runtimeStatus: "preparing",
				memberRuntime: {},
			}),
		).toMatchObject({ id: "session", runtimeStatus: "preparing" });
		expect(() =>
			parseTeamSessionDocument({
				...session,
				activeMemberIds: ["leader"],
				memberRuntime: { unknown: session.memberRuntime.leader },
			}),
		).toThrow("runtime members do not match");
		expect(() =>
			parseTeamSessionDocument({
				...session,
				events: [
					{
						type: "member-result",
						id: "result",
						requestId: "request",
						memberId: "missing",
						sourceTurnId: "turn",
						text: "result",
						timestamp: 2,
					},
				],
			}),
		).toThrow("unknown member");
	});
});

describe("parseTeamSessionDocument deliveredEventIds 读侧窗口化", () => {
	const session = {
		schemaVersion: 1,
		revision: 0,
		id: "session",
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
				sessionId: "runtime",
				sessionPath: "C:/sessions/runtime.jsonl",
				agentProfileRevision: 1,
				deliveredEventIds: [],
			},
		},
	};

	it("接受超窗的历史回执并截断到最近 256 条，其余字段保持", () => {
		const legacyIds = Array.from({ length: 600 }, (_, index) => `receipt-${index}`);
		const parsed = parseTeamSessionDocument({
			...session,
			memberRuntime: {
				leader: { ...session.memberRuntime.leader, deliveredEventIds: legacyIds },
			},
		});
		const runtime = parsed.memberRuntime.leader;
		if (!runtime) throw new Error("missing leader runtime");
		expect(runtime.deliveredEventIds.length).toBe(256);
		expect(runtime.deliveredEventIds[0]).toBe("receipt-344");
		expect(runtime.deliveredEventIds.at(-1)).toBe("receipt-599");
		expect(runtime.sessionId).toBe("runtime");
	});

	it("513 条（旧 stringList 上限之外）可解析并截断；非字符串与重复 id 仍然拒绝", () => {
		const ids = Array.from({ length: 513 }, (_, index) => `r-${index}`);
		const parsed = parseTeamSessionDocument({
			...session,
			memberRuntime: { leader: { ...session.memberRuntime.leader, deliveredEventIds: ids } },
		});
		expect(parsed.memberRuntime.leader?.deliveredEventIds.length).toBe(256);
		expect(() =>
			parseTeamSessionDocument({
				...session,
				memberRuntime: { leader: { ...session.memberRuntime.leader, deliveredEventIds: ["ok", 42] } },
			}),
		).toThrow("Invalid Agent Team session document");
		expect(() =>
			parseTeamSessionDocument({
				...session,
				memberRuntime: { leader: { ...session.memberRuntime.leader, deliveredEventIds: ["dup", "dup"] } },
			}),
		).toThrow("Invalid Agent Team session document");
	});
});
