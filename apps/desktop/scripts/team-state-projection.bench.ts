// Copyright The Open Forge contributors.
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
	createTeamSharedContextCheckpoint,
	createTeamSharedContextGeneration,
} from "@vetta/agent-team";
import type {
	TeamContextProjectionReceipt,
	TeamMemberTurnAttempt,
	TeamMessageDelivery,
	TeamPublicationOperationRecord,
	TeamSessionDocument,
	TeamWorkItem,
} from "@vetta/agent-team";
import { createEmptyConversationDocument } from "@vetta/runtime-core/conversation";
import type { ConversationDocument, ConversationDocumentEntry } from "@vetta/runtime-core/conversation";
import { TeamCollaborationStore } from "../src/main/agent-teams/team-collaboration-store.js";
import type { TeamCollaborationState } from "../src/main/agent-teams/team-collaboration-store.js";

/** Synthetic public facts only. Fixture construction and oracle checks are outside timing. */
export function teamProjectionFixture(taskCount: number, memberCount: number, salt: number) {
	let document = createEmptyConversationDocument({ sessionId: `coordination-${salt}`, createdAt: 1 });
	const expected: { -readonly [K in keyof TeamCollaborationState]: TeamCollaborationState[K] } = {
		workItems: [], attempts: [], deliveries: [], publications: [], checkpoints: [], contextGenerations: [], contextReceipts: [],
	};
	const entries: ConversationDocumentEntry[] = [];
	const append = (customType: string, data: unknown) => {
		const id = `entry-${entries.length}`;
		entries.push({ id, parentId: entries.at(-1)?.id ?? null, timestamp: new Date(1).toISOString(), type: "custom", customType, data });
	};
	for (let index = 0; index < taskCount; index += 1) {
		const memberId = `member-${index % memberCount}`;
		const work: TeamWorkItem = {
			id: `work-${salt}-${index}`, requestTurnId: `request-${index}`, createdByParticipantId: "leader",
			assignedToParticipantId: memberId, objective: `Inspect synthetic module ${index}: preserve cancellation and result ordering.`,
			contextEntryIds: [], state: "queued", revision: 0, createdAt: index + 1, updatedAt: index + 1,
		};
		const attempt: TeamMemberTurnAttempt = {
			id: `attempt-${index}`, workItemId: work.id, participantConversationId: memberId,
			sourceTurnId: `turn-${index}`, attempt: 1, mode: "initial", state: "running", lastProgressAt: index + 1,
		};
		const delivery: TeamMessageDelivery = {
			id: `delivery-${index}`, messageId: `message-${index}`, fromParticipantId: "leader", toParticipantId: memberId,
			intent: index % 2 === 0 ? "question" : "inform", state: "pending", createdAt: index + 1, updatedAt: index + 1,
		};
		const publication: TeamPublicationOperationRecord = {
			customType: "agent-team.publication-operation.v1", operationId: `publication-${index}`, workItemId: work.id,
			sourceParticipantConversationId: memberId, sourceTurnId: attempt.sourceTurnId, sourceMessageEntryId: `private-${index}`,
			state: "completed", generation: 1,
		};
		append("agent-team.work-item.v1", work);
		append("agent-team.member-attempt.v1", attempt);
		append("agent-team.message-delivery.v1", delivery);
		append("unrelated-metadata", { ignored: index });
		const completedWork: TeamWorkItem = { ...work, state: "completed", revision: 1, resultMessageId: `public-${index}` };
		const completedAttempt: TeamMemberTurnAttempt = { ...attempt, state: "completed" };
		const delivered: TeamMessageDelivery = { ...delivery, state: delivery.intent === "question" ? "responded" : "delivered" };
		append("agent-team.work-item.v1", completedWork);
		append("agent-team.member-attempt.v1", completedAttempt);
		append("agent-team.message-delivery.v1", delivered);
		append(publication.customType, publication);
		expected.workItems = [...expected.workItems, completedWork];
		expected.attempts = [...expected.attempts, completedAttempt];
		expected.deliveries = [...expected.deliveries, delivered];
		expected.publications = [...expected.publications, publication];
		if (index % 8 === 0) {
			const checkpoint = createTeamSharedContextCheckpoint({
				coordinationConversationId: document.identity.sessionId, throughConversationRevision: entries.length,
				policyVersion: "public-results-v1", memberHandles: {},
				records: [{ eventId: `public-${index}`, type: "agent-team.member-result.v1", text: `Synthetic result ${salt}:${index}`, timestamp: index + 1,
					metadata: { teamSessionId: `team-${salt}`, requestId: `request-${index}`, sourceMemberId: memberId } }],
			});
			const generation = createTeamSharedContextGeneration({ teamRevision: 1, checkpoint });
			const receipt: TeamContextProjectionReceipt = {
				participantId: memberId, participantConversationId: memberId, generationId: generation.id,
				checkpointId: checkpoint.id, projectionPolicyId: checkpoint.policyVersion,
				sourceEntryIds: checkpoint.sourceEntryIds, sourceFingerprint: checkpoint.sourceFingerprint, deliveredAt: index + 1,
			};
			append("agent-team.shared-checkpoint.v1", checkpoint);
			append("agent-team.context-generation.v1", generation);
			append("agent-team.context-receipt.v1", receipt);
			expected.checkpoints = [...expected.checkpoints, checkpoint];
			expected.contextGenerations = [...expected.contextGenerations, generation];
			expected.contextReceipts = [...expected.contextReceipts, receipt];
		}
	}
	// A malformed latest record must not erase the last valid state.
	append("agent-team.work-item.v1", { id: expected.workItems[0]?.id, state: "made-up" });
	document = { ...document, entries, revision: entries.length, activeLeafId: entries.at(-1)?.id ?? null };
	return { document, expected };
}

export function projectionStore(read: () => ConversationDocument): TeamCollaborationStore {
	return new TeamCollaborationStore({ readSessionDocument: read, appendSessionMetadataEntry: async () => { throw new Error("Read-only fixture"); } });
}

function session(document: ConversationDocument): TeamSessionDocument {
	return {
		schemaVersion: 1, revision: 0, id: "team", teamId: "team", name: "Synthetic team", cwd: ".", leaderMemberId: "leader",
		memberHandles: {}, createdAt: 1, updatedAt: 1, events: [], memberRuntime: {},
		coordinationRuntime: { sessionId: document.identity.sessionId, sessionPath: "synthetic.jsonl" },
	};
}

/** Append real task lifecycle shapes, not rewrites of already completed objectives. */
export function projectionLifecycle(document: ConversationDocument, initial: TeamCollaborationState, steps: number, members: number) {
	const snapshots: ConversationDocument[] = [];
	const workItems = new Map(initial.workItems.map((work) => [work.id, work]));
	const attempts = new Map(initial.attempts.map((attempt) => [attempt.id, attempt]));
	let previous = document;
	for (let step = 0; step < steps; step += 1) {
		const task = Math.floor(step / 3);
		const phase = step % 3;
		const member = `member-${task % members}`;
		const work: TeamWorkItem = {
			id: `active-work-${task}`, requestTurnId: `active-request-${task}`, createdByParticipantId: "leader",
			assignedToParticipantId: member, objective: `Verify synthetic module ${task}`, contextEntryIds: [],
			state: phase === 0 ? "queued" : phase === 1 ? "running" : "completed", revision: phase,
			createdAt: 100_000 + task * 3, updatedAt: 100_000 + step,
			...(phase > 0 ? { currentAttemptId: `active-attempt-${task}` } : {}),
			...(phase === 2 ? { resultMessageId: `active-result-${task}` } : {}),
		};
		const appended: ConversationDocumentEntry[] = [];
		const append = (customType: string, data: unknown) => {
			appended.push({ type: "custom", customType, data, id: `progress-${step}-${appended.length}`,
				parentId: appended.at(-1)?.id ?? previous.activeLeafId, timestamp: new Date(100_000 + step).toISOString() });
		};
		if (phase > 0) {
			const attempt: TeamMemberTurnAttempt = {
				id: `active-attempt-${task}`, workItemId: work.id, participantConversationId: member,
				sourceTurnId: `active-turn-${task}`, attempt: 1, mode: "initial",
				state: phase === 1 ? "running" : "completed", lastProgressAt: 100_000 + step,
			};
			append("agent-team.member-attempt.v1", attempt);
			attempts.set(attempt.id, attempt);
		}
		append("agent-team.work-item.v1", work);
		workItems.set(work.id, work);
		previous = { ...previous, revision: previous.revision + appended.length, activeLeafId: appended.at(-1)!.id,
			entries: [...previous.entries, ...appended] };
		snapshots.push(previous);
	}
	return { snapshots, expected: { ...initial, workItems: [...workItems.values()], attempts: [...attempts.values()] } };
}

/** Freeze semantics before the first measurement; holdouts are not used for tuning. */
export function runTeamStateBenchmark(holdout = false) {
	const cases = holdout
		? [{ name: "held_medium", tasks: 73, members: 3, reads: 7, steps: 19 }, { name: "held_long", tasks: 613, members: 7, reads: 13, steps: 37 }]
		: [{ name: "short", tasks: 16, members: 1, reads: 5, steps: 24 }, { name: "mixed", tasks: 128, members: 4, reads: 9, steps: 32 }, { name: "long", tasks: 512, members: 8, reads: 9, steps: 40 }];
	const results = cases.map((scenario, caseIndex) => {
		const { document, expected } = teamProjectionFixture(scenario.tasks, scenario.members, caseIndex + (holdout ? 103 : 11));
		const reader = projectionStore(() => document);
		assert.deepEqual(reader.read(session(document)), expected);
		const { snapshots, expected: finalExpected } = projectionLifecycle(document, expected, scenario.steps, scenario.members);
		const timings: number[] = [];
		const coldTimings: number[] = [];
		let checksum = 0;
		for (let repeat = 0; repeat < 9; repeat += 1) {
			const store = projectionStore(() => document);
			const coldStart = performance.now();
			checksum += store.readFromDocument(document).workItems.length;
			const cold = performance.now() - coldStart;
			const started = performance.now();
			for (const snapshot of snapshots) {
				for (let read = 0; read < scenario.reads; read += 1) {
					const state = store.readFromDocument(snapshot);
					checksum += state.workItems.length + state.contextReceipts.length + state.attempts.length;
				}
			}
			const duration = performance.now() - started;
			if (repeat >= 2) { timings.push(duration); coldTimings.push(cold); }
		}
		// Check the final changed snapshot, not just a constant fixture or result count.
		assert.deepEqual(reader.readFromDocument(snapshots.at(-1)!), finalExpected);
		return { ...scenario, entries: document.entries.length, medianMs: median(timings), coldMs: median(coldTimings),
			p95Ms: [...timings].sort((a, b) => a - b).at(-1)!, spreadPct: (Math.max(...timings) - Math.min(...timings)) / median(timings) * 100, checksum };
	});
	return { version: 1, holdout, runtime: process.version, results, totalMs: results.reduce((sum, result) => sum + result.medianMs, 0) };
}

function median(values: readonly number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)]!;
}
