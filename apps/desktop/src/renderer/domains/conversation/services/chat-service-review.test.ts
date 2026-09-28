import { describe, expect, it } from "vitest";
import { extractToolUiDetails } from "./chat-service";

const validReview = {
	snapshotId: "snap-1",
	relativePath: "src/app.ts",
	operation: "edit",
	status: "modified",
	state: "active",
	addedLines: 3,
	removedLines: 1,
	rollbackable: true,
};

describe("write/edit review tool details", () => {
	it("keeps a well-formed review payload for the transcript card", () => {
		expect(extractToolUiDetails(undefined, { review: validReview })).toEqual({ review: validReview });
		expect(extractToolUiDetails({ details: { review: { ...validReview, binary: true } } }, undefined)).toEqual({
			review: { ...validReview, binary: true },
		});
	});

	it("preserves the review alongside the existing diff details", () => {
		expect(
			extractToolUiDetails(undefined, {
				diff: "+1 x",
				firstChangedLine: 1,
				review: validReview,
			}),
		).toEqual({ diff: "+1 x", firstChangedLine: 1, review: validReview });
	});

	it("ignores malformed or legacy details without throwing", () => {
		// 旧会话记录没有 review 字段；畸形字段一律降级为无 review，卡片照常渲染。
		expect(extractToolUiDetails(undefined, { diff: "+1 x" })).toEqual({ diff: "+1 x" });
		expect(extractToolUiDetails(undefined, undefined)).toBeUndefined();
		expect(extractToolUiDetails(undefined, { review: { ...validReview, snapshotId: "" } })).toBeUndefined();
		expect(extractToolUiDetails(undefined, { review: { ...validReview, addedLines: -1 } })).toBeUndefined();
		expect(extractToolUiDetails(undefined, { review: "snap-1" })).toBeUndefined();
		expect(extractToolUiDetails(undefined, { review: { ...validReview, before: "bytes" } })).toBeUndefined();
	});
});
