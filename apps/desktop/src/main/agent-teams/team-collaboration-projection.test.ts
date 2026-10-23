// Copyright The Open Forge contributors.
import type { TeamWorkItem } from "@vetta/agent-team";
import type { ConversationDocument, ConversationDocumentEntry } from "@vetta/runtime-core/conversation";
import { describe, expect, it } from "vitest";
import {
	projectionLifecycle,
	projectionStore,
	teamProjectionFixture,
} from "../../../scripts/team-state-projection.bench.js";

function withWork(document: ConversationDocument, work: TeamWorkItem): ConversationDocument {
	const id = `update-${document.entries.length}`;
	return {
		...document,
		revision: document.revision + 1,
		activeLeafId: id,
		entries: [
			...document.entries,
			{
				type: "custom",
				id,
				parentId: document.activeLeafId,
				timestamp: new Date(1).toISOString(),
				customType: "agent-team.work-item.v1",
				data: work,
			},
		],
	};
}

describe("Team collaboration document projection contract", () => {
	it.each([1, 5, 11])("replays %i lifecycle appends without rewriting a finished objective", (steps) => {
		const { document, expected } = teamProjectionFixture(9, 3, 17);
		const flow = projectionLifecycle(document, expected, steps, 3);
		const store = projectionStore(() => document);
		for (const [step, snapshot] of flow.snapshots.entries()) {
			const work = store.readFromDocument(snapshot).workItems.at(-1)!;
			expect(work.state).toBe(["queued", "running", "completed"][step % 3]);
			expect(work.objective).toBe(`Verify synthetic module ${Math.floor(step / 3)}`);
		}
		expect(store.readFromDocument(flow.snapshots.at(-1)!)).toEqual(flow.expected);
		expect(store.readFromDocument(document)).toEqual(expected);
	});
	it.each([
		[1, 1, 7],
		[17, 4, 53],
		[83, 7, 211],
	])(
		"preserves all seven record types, insertion order and last valid revision (%i tasks)",
		(count, members, salt) => {
			const { document, expected } = teamProjectionFixture(count, members, salt);
			const store = projectionStore(() => document);
			expect(store.readFromDocument(document)).toEqual(expected);
			expect(store.readFromDocument(document)).toEqual(expected);
		},
	);

	it("keeps old results stable while append updates, historical reads and restoration alternate", () => {
		const { document, expected } = teamProjectionFixture(29, 4, 83);
		const store = projectionStore(() => document);
		const initial = store.readFromDocument(document);
		const changed = { ...expected.workItems[0]!, objective: "Follow-up with new evidence", revision: 2 };
		const next = withWork(document, changed);
		const nextExpected = { ...expected, workItems: [changed, ...expected.workItems.slice(1)] };
		expect(store.readFromDocument(next)).toEqual(nextExpected);
		expect(initial).toEqual(expected);
		expect(store.readFromDocument(document)).toEqual(expected);
		expect(store.readFromDocument(structuredClone(next))).toEqual(nextExpected);
		expect(store.readFromDocument(next)).toEqual(nextExpected);
	});

	it("does not use revision, leaf or entry count alone as content identity", () => {
		const first = teamProjectionFixture(11, 3, 1);
		const second = teamProjectionFixture(11, 3, 2);
		const sameIdentity = { ...second.document, identity: first.document.identity };
		expect(sameIdentity.revision).toBe(first.document.revision);
		expect(sameIdentity.activeLeafId).toBe(first.document.activeLeafId);
		const store = projectionStore(() => first.document);
		expect(store.readFromDocument(first.document)).toEqual(first.expected);
		expect(store.readFromDocument(sameIdentity)).toEqual(second.expected);
		expect(store.readFromDocument(first.document)).toEqual(first.expected);
	});

	it("does not let invalid later records hide valid state for any record family", () => {
		const { document, expected } = teamProjectionFixture(9, 2, 17);
		const invalid = document.entries
			.filter((entry) => entry.type === "custom")
			.map(
				(entry, index): ConversationDocumentEntry => ({
					...entry,
					id: `invalid-${index}`,
					data: { id: "invalid", state: "not-a-state" },
				}),
			);
		const polluted = {
			...document,
			entries: [...document.entries, ...invalid],
			revision: document.revision + invalid.length,
		};
		const store = projectionStore(() => document);
		expect(store.readFromDocument(document)).toEqual(expected);
		expect(store.readFromDocument(polluted)).toEqual(expected);
	});

	it("retains receipt and publication replacement keys rather than treating every append as a new item", () => {
		const { document, expected } = teamProjectionFixture(9, 2, 31);
		const receipt = { ...expected.contextReceipts[0]!, deliveredAt: 99 };
		const publication = { ...expected.publications[0]!, state: "needs-recovery" as const };
		const updates: ConversationDocumentEntry[] = [
			{
				type: "custom",
				id: "receipt-update",
				parentId: document.activeLeafId,
				timestamp: new Date(1).toISOString(),
				customType: "agent-team.context-receipt.v1",
				data: receipt,
			},
			{
				type: "custom",
				id: "publication-update",
				parentId: "receipt-update",
				timestamp: new Date(1).toISOString(),
				customType: "agent-team.publication-operation.v1",
				data: publication,
			},
		];
		const next = {
			...document,
			entries: [...document.entries, ...updates],
			revision: document.revision + 2,
			activeLeafId: "publication-update",
		};
		const store = projectionStore(() => document);
		const previous = store.readFromDocument(document);
		expect(store.readFromDocument(next)).toEqual({
			...expected,
			contextReceipts: [receipt, ...expected.contextReceipts.slice(1)],
			publications: [publication, ...expected.publications.slice(1)],
		});
		expect(previous).toEqual(expected);
	});
});
