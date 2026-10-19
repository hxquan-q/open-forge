// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import type { ConversationDocumentEntry } from "../../src/conversation/document.js";
import { conversationDocumentEntriesIndex } from "../../src/conversation/document-index.js";

function entry(id: string, parentId: string | null): ConversationDocumentEntry {
	return {
		type: "custom",
		id,
		parentId,
		timestamp: `2026-10-17T00:00:0${id.length % 10}.000Z`,
		customType: "test.entry",
	} as ConversationDocumentEntry;
}

function branchFixture(): readonly ConversationDocumentEntry[] {
	return [entry("root", null), entry("left", "root"), entry("left-child", "left"), entry("right", "root")];
}

describe("conversationDocumentEntriesIndex", () => {
	it("memoizes the index by entries array identity", () => {
		const entries = branchFixture();
		const again = [...entries];

		expect(conversationDocumentEntriesIndex(entries)).toBe(conversationDocumentEntriesIndex(entries));
		expect(conversationDocumentEntriesIndex(entries)).not.toBe(conversationDocumentEntriesIndex(again));
	});

	it("indexes every entry by id matching brute-force lookup", () => {
		const entries = branchFixture();
		const index = conversationDocumentEntriesIndex(entries);

		for (const candidate of entries) {
			expect(index.byId.get(candidate.id)).toBe(candidate);
		}
		expect(index.byId.has("missing")).toBe(false);
		expect(index.byId.size).toBe(entries.length);
	});

	it("groups direct children by parent including the null root", () => {
		const entries = branchFixture();
		const index = conversationDocumentEntriesIndex(entries);

		expect(index.childrenByParent.get(null)?.map(({ id }) => id)).toEqual(["root"]);
		expect(index.childrenByParent.get("root")?.map(({ id }) => id)).toEqual(["left", "right"]);
		expect(index.childrenByParent.get("left")?.map(({ id }) => id)).toEqual(["left-child"]);
		expect(index.childrenByParent.get("missing")).toBeUndefined();
	});

	it("serves fresh results for a new entries array after document growth", () => {
		const before = branchFixture();
		conversationDocumentEntriesIndex(before);

		const after = [...before, entry("new-leaf", "left-child")];
		const index = conversationDocumentEntriesIndex(after);

		expect(index.byId.has("new-leaf")).toBe(true);
		expect(index.childrenByParent.get("left-child")?.map(({ id }) => id)).toEqual(["new-leaf"]);
	});
});
