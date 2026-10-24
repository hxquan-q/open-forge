// Modified by The Open Forge contributors.
import type { TeamSessionDocument, TeamWorkItem } from "@vetta/agent-team";
import { type ConversationDocument, createEmptyConversationDocument } from "@vetta/runtime-core";
import { describe, expect, it } from "vitest";
import { TeamCollaborationStore } from "./team-collaboration-store.js";
import { TeamNotificationJournal, undeliveredTeamNotifications } from "./team-notification-journal.js";

function fixture() {
	let document = createEmptyConversationDocument({ sessionId: "coordination", createdAt: 1 });
	const port = {
		readSessionDocument: () => document,
		appendSessionMetadataEntry: async (_id: string, customType: string, data?: unknown) => {
			const entry = {
				type: "custom" as const,
				id: `entry-${document.entries.length}`,
				parentId: document.activeLeafId,
				timestamp: "1",
				customType,
				data,
			};
			document = { ...document, entries: [...document.entries, entry], activeLeafId: entry.id };
		},
	};
	const store = new TeamCollaborationStore(port);
	const runtime = {
		sessionId: "member-runtime",
		sessionPath: "/fixture/member",
		agentProfileRevision: 1,
		deliveredEventIds: [],
	};
	const session: TeamSessionDocument = {
		schemaVersion: 1,
		revision: 0,
		id: "team-session",
		teamId: "team",
		name: "Team",
		cwd: "/fixture",
		leaderMemberId: "leader",
		memberHandles: { leader: "leader", member: "member" },
		createdAt: 1,
		updatedAt: 1,
		coordinationRuntime: { sessionId: "coordination", sessionPath: "/fixture/coordination" },
		events: [],
		memberRuntime: { member: runtime, leader: { ...runtime, sessionId: "leader-runtime" } },
	};
	const input = {
		session,
		memberId: "member",
		requestId: "task",
		createdByParticipantId: "leader",
		objective: "Review",
	};
	return {
		store,
		session,
		input,
		journal: new TeamNotificationJournal(store),
		restart: () => new TeamNotificationJournal(new TeamCollaborationStore(port)),
	};
}

describe("durable Team task notification handoff", () => {
	it("rediscovers an unrecorded terminal outcome and admits its context exactly once across restart", async () => {
		const { store, session, input, restart } = fixture();
		const attempt = await store.begin({ ...input, sourceTurnId: "first", mode: "initial" });
		const completed = await store.settle(
			session,
			attempt.workItem,
			attempt.attempt,
			{ state: "completed" },
			"published-result",
		);
		const restored = restart();
		await restored.record(session, completed);
		await restored.record(session, completed);
		const pending = restored.pending(session, "leader");
		expect(pending).toHaveLength(1);
		const ids = pending.map((entry) => entry.id);
		await store.enqueue({
			session,
			memberId: "leader",
			requestId: "follow-up",
			createdByParticipantId: "local-user",
			objective: "Integrate result",
			notificationIds: ids,
		});
		const admitted = restart();
		expect(admitted.pending(session)).toHaveLength(0);
		const context = admitted.contexts(session, ids);
		expect(context).toMatchObject([
			{
				type: "agent-team.task-completed.v1",
				metadata: { notificationId: ids[0], resultMessageId: "published-result" },
			},
		]);
		const memberDocument: ConversationDocument = {
			...createEmptyConversationDocument({ sessionId: "leader-runtime", createdAt: 1 }),
			entries: [
				{
					type: "custom_message",
					id: "delivered",
					parentId: null,
					timestamp: "1",
					customType: context[0]!.type,
					content: context[0]!.content,
					details: context[0]!.metadata,
					display: false,
				},
			],
		};
		expect(undeliveredTeamNotifications(context, memberDocument)).toHaveLength(0);
	});

	it("keeps blocked outcomes actionable and never turns a legacy completed task into a new wake", async () => {
		const { store, session, input, journal } = fixture();
		const attempt = await store.begin({ ...input, sourceTurnId: "first", mode: "initial" });
		const blocked = await store.settle(session, attempt.workItem, attempt.attempt, {
			state: "awaiting-resource",
			issue: { category: "authentication", retryability: "after-external-change", code: "AI_AUTHENTICATION_FAILED" },
		});
		await journal.record(session, blocked);
		const pending = journal.pending(session);
		expect(
			journal.contexts(
				session,
				pending.map((entry) => entry.id),
			),
		).toMatchObject([
			{
				type: "agent-team.task-status.v1",
				metadata: { state: "attention-required", issue: { category: "authentication" } },
			},
		]);
		await journal.record(session, {
			...blocked,
			id: "legacy",
			recovery: undefined,
			state: "completed",
			resultMessageId: "old-result",
		});
		expect(journal.pending(session)).toHaveLength(1);
	});

	it("persists stop across restart and discards previous notices when the user starts new work", async () => {
		const { store, session, input, journal, restart } = fixture();
		const attempt = await store.begin({ ...input, sourceTurnId: "first", mode: "initial" });
		const completed = await store.settle(
			session,
			attempt.workItem,
			attempt.attempt,
			{ state: "completed" },
			"result",
		);
		await journal.stop(session);
		const restored = restart();
		expect(restored.isStopped(session)).toBe(true);
		await restored.record(session, completed);
		expect(restored.pending(session)).toHaveLength(0);
		await restored.resume(session);
		await restored.record(session, completed);
		expect(restored.isStopped(session)).toBe(false);
		expect(restored.pending(session)).toHaveLength(0);
	});
});

describe("journal index equivalence", () => {
	it("keeps stop state, pending notices and result contexts identical, and invalidates on append", () => {
		const fixture = indexFixture(6);
		const journal = new TeamNotificationJournal(fixture.store);
		expect(journal.isStopped(fixture.session)).toBe(false);
		const firstPending = journal.pending(fixture.session, "leader");
		expect(firstPending).toHaveLength(6);
		const firstContexts = journal.contexts(
			fixture.session,
			firstPending.map((notice) => notice.id),
		);
		expect(firstContexts).toHaveLength(6);
		// Same snapshot read twice must be identical, not merely equal in length.
		expect(
			JSON.stringify(
				journal.contexts(
					fixture.session,
					firstPending.map((notice) => notice.id),
				),
			),
		).toBe(JSON.stringify(firstContexts));

		fixture.append("agent-team.recovery-stop.v1", true);
		expect(journal.isStopped(fixture.session)).toBe(true);
		expect(journal.pending(fixture.session, "leader")).toHaveLength(0);
		// Already-admitted notices can still be rebuilt while the team is stopped.
		expect(
			journal.contexts(
				fixture.session,
				firstPending.map((notice) => notice.id),
			),
		).toHaveLength(6);

		fixture.append("agent-team.recovery-stop.v1", false);
		expect(journal.isStopped(fixture.session)).toBe(false);
		expect(journal.pending(fixture.session, "leader")).toHaveLength(6);
	});

	it("does not serve a cached notice table for a different document snapshot", () => {
		const fixture = indexFixture(3);
		const journal = new TeamNotificationJournal(fixture.store);
		expect(journal.pending(fixture.session, "leader")).toHaveLength(3);

		// A separate store over a document with the notices stripped must not see them.
		const stripped = {
			...fixture.document(),
			entries: fixture
				.document()
				.entries.filter(
					(entry) => entry.type !== "custom" || entry.customType !== "agent-team.task-notification.v1",
				),
		};
		const otherJournal = new TeamNotificationJournal(
			new TeamCollaborationStore({
				readSessionDocument: () => stripped,
				appendSessionMetadataEntry: async () => undefined,
			}),
		);
		expect(otherJournal.pending(fixture.session, "leader")).toHaveLength(0);
		expect(journal.pending(fixture.session, "leader")).toHaveLength(3);
	});

	it("drops cancelled notices from pending while keeping their context buildable", () => {
		const fixture = indexFixture(2);
		const journal = new TeamNotificationJournal(fixture.store);
		const first = fixture.workItems[0]!;
		fixture.append("agent-team.task-notification.v1", { id: `${first.id}:notice`, workItem: first, cancelled: true });
		const pending = journal.pending(fixture.session, "leader");
		expect(pending.map((notice) => notice.workItem.id)).toEqual([fixture.workItems[1]!.id]);
		expect(journal.contexts(fixture.session, [`${first.id}:notice`])).toHaveLength(1);
	});

	it("drops an already-admitted notice once its receiving work item recorded the id", () => {
		const fixture = indexFixture(2);
		const journal = new TeamNotificationJournal(fixture.store);
		const admitted = fixture.workItems[0]!;
		fixture.append("agent-team.work-item.v1", {
			...admitted,
			revision: 3,
			notificationIds: [`${admitted.id}:notice`],
		});
		expect(journal.pending(fixture.session, "leader").map((notice) => notice.workItem.id)).toEqual([
			fixture.workItems[1]!.id,
		]);
	});
});

function indexFixture(tasks: number) {
	const entries: ConversationDocument["entries"][number][] = [];
	const workItems: TeamWorkItem[] = [];
	const append = (customType: string, data: unknown) => {
		entries.push({
			type: "custom",
			id: `entry-${entries.length}`,
			parentId: entries.at(-1)?.id ?? null,
			timestamp: new Date(entries.length + 1).toISOString(),
			customType,
			data,
		});
	};
	for (let index = 0; index < tasks; index += 1) {
		const resultId = `result-${index}`;
		const workItem: TeamWorkItem = {
			id: `work-${index}`,
			requestTurnId: `req-${index}`,
			createdByParticipantId: "leader",
			assignedToParticipantId: "member",
			objective: `Task ${index}`,
			contextEntryIds: [],
			state: "completed",
			resultMessageId: resultId,
			createdAt: index + 1,
			updatedAt: index + 2,
			revision: 2,
			recovery: { maxAutomaticRetries: 2, automaticRetries: 0 },
		};
		workItems.push(workItem);
		append("agent-team.work-item.v1", workItem);
		append("agent-team.task-notification.v1", { id: `${workItem.id}:notice`, workItem, cancelled: false });
		entries.push({
			type: "message",
			kind: "agent",
			id: resultId,
			parentId: entries.at(-1)?.id ?? null,
			timestamp: new Date(index + 1).toISOString(),
			turnId: `turn-${index}`,
			author: { kind: "agent", id: "member" },
			message: {
				role: "assistant",
				content: [{ type: "text", text: `Result ${index}` }],
				api: "openai-responses",
				provider: "openai",
				model: "test",
				usage: {
					input: 1,
					output: 1,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 2,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
				timestamp: index + 1,
			},
		});
	}
	let document: ConversationDocument = {
		identity: { sessionId: "coordination", createdAt: 1 },
		journalVersion: 0,
		revision: entries.length,
		entries: [...entries],
		activeLeafId: entries.at(-1)?.id ?? null,
	};
	const store = new TeamCollaborationStore({
		readSessionDocument: () => document,
		appendSessionMetadataEntry: async (_sessionId, customType, data) => {
			append(customType, data);
			document = {
				...document,
				revision: document.revision + 1,
				entries: [...entries],
				activeLeafId: entries.at(-1)?.id ?? null,
			};
		},
	});
	const session: TeamSessionDocument = {
		schemaVersion: 1,
		revision: 0,
		id: "team-session",
		teamId: "team",
		name: "Team",
		cwd: ".",
		leaderMemberId: "leader",
		memberHandles: {},
		createdAt: 1,
		updatedAt: 1,
		events: [],
		memberRuntime: {
			leader: { sessionId: "leader-rt", sessionPath: "a.jsonl", agentProfileRevision: 1, deliveredEventIds: [] },
		},
		coordinationRuntime: { sessionId: "coordination", sessionPath: "b.jsonl" },
	} as unknown as TeamSessionDocument;
	return {
		store,
		session,
		workItems,
		document: () => document,
		append: (customType: string, data: unknown) => {
			append(customType, data);
			document = {
				...document,
				revision: document.revision + 1,
				entries: [...entries],
				activeLeafId: entries.at(-1)?.id ?? null,
			};
		},
	};
}
