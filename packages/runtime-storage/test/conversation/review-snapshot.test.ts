import { describe, expect, it } from "vitest";
import {
	decideReviewRollback,
	parseReviewSnapshotMeta,
	parseToolResultReview,
	type ReviewSnapshotMeta,
	type ToolResultReview,
} from "../../src/conversation/review-snapshot.js";

function validReview(): ToolResultReview {
	return {
		snapshotId: "snap-1",
		relativePath: "src/app.ts",
		operation: "edit",
		status: "modified",
		state: "active",
		addedLines: 3,
		removedLines: 1,
		rollbackable: true,
	};
}

function validMeta(): ReviewSnapshotMeta {
	return {
		schemaVersion: 1,
		sessionId: "session-1",
		snapshotId: "snap-1",
		path: "src/app.ts",
		absolutePath: "C:\\workspace\\src\\app.ts",
		operation: "edit",
		status: "modified",
		state: "active",
		addedLines: 3,
		removedLines: 1,
		beforeExists: true,
		beforeHash: "b".repeat(64),
		afterExists: true,
		afterHash: "a".repeat(64),
		reversible: true,
		createdAt: 1_700_000_000_000,
	};
}

describe("parseToolResultReview", () => {
	it("accepts the full wire payload", () => {
		expect(parseToolResultReview(validReview())).toEqual(validReview());
	});

	it("accepts optional flags", () => {
		expect(parseToolResultReview({ ...validReview(), binary: true, truncated: true })).toMatchObject({
			binary: true,
			truncated: true,
		});
	});

	it.each([
		["missing review", undefined],
		["non-object", "review"],
		["missing snapshotId", { ...validReview(), snapshotId: undefined }],
		["empty snapshotId", { ...validReview(), snapshotId: "" }],
		["missing relativePath", { ...validReview(), relativePath: undefined }],
		["unknown operation", { ...validReview(), operation: "move" }],
		["unknown status", { ...validReview(), status: "renamed" }],
		["unknown state", { ...validReview(), state: "pending" }],
		["negative lines", { ...validReview(), addedLines: -1 }],
		["non-integer lines", { ...validReview(), removedLines: 1.5 }],
		["non-boolean rollbackable", { ...validReview(), rollbackable: "yes" }],
		["extra field", { ...validReview(), before: "bytes" }],
	])("rejects %s without throwing", (_label, value) => {
		expect(parseToolResultReview(value)).toBeUndefined();
	});
});

describe("parseReviewSnapshotMeta", () => {
	it("round-trips a persisted meta", () => {
		expect(parseReviewSnapshotMeta(validMeta())).toEqual(validMeta());
	});

	it("rejects malformed or version-mismatched meta", () => {
		expect(parseReviewSnapshotMeta({ ...validMeta(), schemaVersion: 2 })).toBeUndefined();
		expect(parseReviewSnapshotMeta({ ...validMeta(), absolutePath: "" })).toBeUndefined();
		expect(parseReviewSnapshotMeta({ ...validMeta(), beforeHash: "" })).toBeUndefined();
		expect(parseReviewSnapshotMeta({ ...validMeta(), snapshotBytes: 10 })).toBeUndefined();
		expect(parseReviewSnapshotMeta(undefined)).toBeUndefined();
	});
});

describe("decideReviewRollback", () => {
	it("restores when current hash matches the recorded after hash", () => {
		const meta = { afterExists: true, afterHash: "abc" };
		expect(decideReviewRollback(meta, { exists: true, hash: "abc" })).toBe("restore");
	});

	it("conflicts when the file was modified externally", () => {
		const meta = { afterExists: true, afterHash: "abc" };
		expect(decideReviewRollback(meta, { exists: true, hash: "def" })).toBe("conflict");
	});

	it("conflicts when the file was deleted externally", () => {
		const meta = { afterExists: true, afterHash: "abc" };
		expect(decideReviewRollback(meta, { exists: false })).toBe("conflict");
	});

	it("conflicts when a file reappears after the tool deleted it", () => {
		const meta = { afterExists: false };
		expect(decideReviewRollback(meta, { exists: true, hash: "abc" })).toBe("conflict");
	});

	it("restores when both sides are absent", () => {
		const meta = { afterExists: false };
		expect(decideReviewRollback(meta, { exists: false })).toBe("restore");
	});
});
