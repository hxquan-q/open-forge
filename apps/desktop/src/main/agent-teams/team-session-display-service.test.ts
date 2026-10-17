// Modified by The Open Forge contributors.
import { createAssistantMessage } from "@vetta/ai";
import type { ConversationDocument, HistoryEntry, RuntimeHost } from "@vetta/runtime-core";
import { describe, expect, it } from "vitest";
import type { TeamCollaborationStore } from "./team-collaboration-store.js";
import {
	projectTeamPublicMessages,
	projectTeamUserMessageAnnotations,
	TeamSessionDisplayService,
} from "./team-session-display-service.js";

describe("projectTeamPublicMessages", () => {
	it("hides member-routed Agent messages while keeping the user request and public answer", () => {
		const document = {
			revision: 4,
			activeLeafId: "public-answer",
			entries: [
				{
					type: "message",
					kind: "user",
					id: "user-request",
					turnId: "request",
					author: { kind: "user", id: "local-user" },
					message: { role: "user", content: "Ask the Team", timestamp: 1 },
				},
				{
					type: "message",
					kind: "agent",
					id: "internal-instruction",
					turnId: "leader-runtime-turn",
					author: { kind: "agent", id: "leader" },
					message: {
						...createAssistantMessage({ api: "test", provider: "test", model: "fixture" }, { timestamp: 2 }),
						content: [{ type: "text", text: "Please reply" }],
					},
				},
				{
					type: "custom",
					customType: "agent-team.message-routing.v1",
					data: {
						customType: "agent-team.message-routing.v1",
						messageEntryId: "internal-instruction",
						addressedParticipantIds: ["researcher", "builder", "reviewer"],
					},
				},
				{
					type: "message",
					kind: "agent",
					id: "public-answer",
					turnId: "request",
					author: { kind: "agent", id: "leader" },
					message: {
						...createAssistantMessage({ api: "test", provider: "test", model: "fixture" }, { timestamp: 3 }),
						content: [{ type: "text", text: "Everyone replied" }],
					},
				},
			],
		} as unknown as ConversationDocument;

		expect(projectTeamPublicMessages(document).map((message) => message.id)).toEqual([
			"user-request",
			"public-answer",
		]);
	});
});

describe("projectTeamUserMessageAnnotations", () => {
	it("projects structured member mentions and ignores routing-only targets", () => {
		const document = {
			revision: 3,
			entries: [
				{
					type: "custom",
					customType: "agent-team.message-routing.v1",
					data: {
						customType: "agent-team.message-routing.v1",
						messageEntryId: "unaddressed",
						requestedParticipantIds: [],
						addressedParticipantIds: ["leader"],
					},
				},
				{
					type: "custom",
					customType: "agent-team.message-routing.v1",
					data: {
						customType: "agent-team.message-routing.v1",
						messageEntryId: "direct",
						requestedParticipantIds: ["researcher"],
						addressedParticipantIds: ["researcher"],
						memberMentions: [{ participantId: "researcher", handle: "research", start: 0, end: 9 }],
					},
				},
			],
		} as unknown as ConversationDocument;

		expect(projectTeamUserMessageAnnotations(document)).toEqual([
			{
				messageEntryId: "direct",
				participantIds: ["researcher"],
				mentions: [{ participantId: "researcher", handle: "research", start: 0, end: 9 }],
			},
		]);
	});

	it("does not infer an audience for routing records written by older versions", () => {
		const document = {
			revision: 1,
			entries: [
				{
					type: "custom",
					customType: "agent-team.message-routing.v1",
					data: {
						customType: "agent-team.message-routing.v1",
						messageEntryId: "legacy",
						addressedParticipantIds: ["leader"],
					},
				},
			],
		} as unknown as ConversationDocument;

		expect(projectTeamUserMessageAnnotations(document)).toEqual([]);
	});
});

describe("TeamSessionDisplayService displayProjection member history cache", () => {
	function memberHistory(): HistoryEntry[] {
		return [
			{
				type: "message",
				entryId: "member-entry-1",
				message: { role: "user", content: "Do the work", timestamp: 1 },
			},
		] as unknown as HistoryEntry[];
	}

	function createHarness() {
		let journalVersion = 5;
		let revision = 3;
		const history = memberHistory();
		let fullHistoryReads = 0;
		const runtime = {
			getSessionPath: (sessionId: string) => `C:/runtime/${sessionId}.jsonl`,
			readSessionDocument: () => ({ journalVersion, revision, entries: [] }) as unknown as ConversationDocument,
			getState: () => ({ contextPercent: 10, contextWindow: 1000 }),
			getFullHistory: () => {
				fullHistoryReads += 1;
				return history;
			},
		} as unknown as RuntimeHost;
		const collaborationStore = {
			read: () => ({ publications: [], workItems: [], attempts: [] }),
			readFromDocument: () => ({ publications: [], workItems: [], attempts: [] }),
		} as unknown as TeamCollaborationStore;
		const session = {
			id: "team-session",
			teamId: "team",
			revision: 1,
			name: "Team",
			cwd: "C:/workspace",
			leaderMemberId: "leader",
			memberHandles: { leader: "vetta" },
			createdAt: 1,
			updatedAt: 1,
			events: [],
			memberRuntime: {
				leader: { sessionId: "leader-runtime", sessionPath: "C:/runtime/leader-runtime.jsonl" },
			},
			coordinationRuntime: {
				sessionId: "coordination-runtime",
				sessionPath: "C:/runtime/coordination-runtime.jsonl",
			},
		} as unknown as Parameters<TeamSessionDisplayService["displayProjection"]>[0];
		const service = new TeamSessionDisplayService(() => runtime, collaborationStore);
		return {
			service,
			session,
			get fullHistoryReads() {
				return fullHistoryReads;
			},
			advanceJournal: () => {
				journalVersion += 1;
			},
			advanceRevision: () => {
				revision += 1;
			},
		};
	}

	it("reuses the member history across projections while both versions hold", async () => {
		const harness = createHarness();
		const first = await harness.service.displayProjection(harness.session);
		const second = await harness.service.displayProjection(harness.session);

		expect(harness.fullHistoryReads).toBe(1); // 版本未变：跨帧复用
		expect(second.memberConversations[0]?.history).toBe(first.memberConversations[0]?.history);
	});

	it("re-reads after the journal version advances (event append)", async () => {
		const harness = createHarness();
		await harness.service.displayProjection(harness.session);
		harness.advanceJournal();
		await harness.service.displayProjection(harness.session);

		expect(harness.fullHistoryReads).toBe(2);
	});

	it("re-reads after the document revision advances (branch/delete command)", async () => {
		const harness = createHarness();
		await harness.service.displayProjection(harness.session);
		harness.advanceRevision();
		await harness.service.displayProjection(harness.session);

		expect(harness.fullHistoryReads).toBe(2);
	});
});
