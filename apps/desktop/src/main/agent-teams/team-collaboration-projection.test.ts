// Copyright The Open Forge contributors.
import type { TeamMemberTurnAttempt, TeamWorkItem } from "@vetta/agent-team";
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

	it("does not serve a cached projection for a replaced or mutated document", () => {
		const { document, expected } = teamProjectionFixture(9, 3, 17);
		const store = projectionStore(() => document);
		expect(store.readFromDocument(document)).toEqual(expected);

		// Same object, appended in place: revision/length must invalidate.
		const appended = { ...expected.workItems[0]!, objective: "Same-object append", revision: 5 };
		const mutable = document as unknown as { entries: unknown[]; revision: number };
		mutable.entries.push({
			type: "custom",
			id: "in-place",
			parentId: null,
			timestamp: new Date(1).toISOString(),
			customType: "agent-team.work-item.v1",
			data: appended,
		});
		mutable.revision += 1;
		expect(store.readFromDocument(document).workItems[0]).toEqual(appended);

		// A replaced document object with the same revision/length must not reuse the old cache entry.
		const replaced: ConversationDocument = {
			...document,
			entries: document.entries.map((entry, index) =>
				index === 1 ? { ...entry, timestamp: "2026-01-01T00:00:00.000Z" } : entry,
			),
		};
		const replacedState = store.readFromDocument(replaced);
		expect(replacedState).not.toBe(store.readFromDocument(document));
		expect(replacedState.publications).toEqual(expected.publications);
	});

	it("invalidates an in-place middle edit when the document revision advances", () => {
		const { document, expected } = teamProjectionFixture(9, 3, 29);
		const store = projectionStore(() => document);
		expect(store.readFromDocument(document)).toEqual(expected);
		const draft = document as unknown as { entries: ConversationDocumentEntry[]; revision: number };
		// 同一任务先写 queued、再写 completed；投影以最后一次**有效**写入为准。
		// 夹具尾部还有一条无效记录（已被投影忽略），所以只挑带 objective 的有效条目。
		let index = -1;
		for (const [candidate, entry] of draft.entries.entries()) {
			if (entry.type !== "custom" || entry.customType !== "agent-team.work-item.v1") continue;
			const data = entry.data as { objective?: unknown } | null;
			if (typeof data?.objective === "string") index = candidate;
		}
		const original = draft.entries[index];
		if (!original || original.type !== "custom") throw new Error("fixture is missing its latest valid work item");
		const target = original.data as TeamWorkItem;
		draft.entries[index] = {
			...original,
			data: { ...target, objective: "Edited in place" },
		};
		draft.revision += 1;
		const updated = store.readFromDocument(document).workItems.find((item) => item.id === target.id);
		expect(updated?.objective).toBe("Edited in place");
	});

	it("returns a fresh mutable result so callers cannot corrupt the cached projection", () => {
		const { document, expected } = teamProjectionFixture(7, 2, 23);
		const store = projectionStore(() => document);
		const first = store.readFromDocument(document);
		(first.workItems as TeamWorkItem[]).length = 0;
		(first.attempts as TeamMemberTurnAttempt[]).sort(() => 1);
		const second = store.readFromDocument(document);
		expect(second).toEqual(expected);
		expect(second.workItems).not.toBe(first.workItems);
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
