// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { parseNameStatus } from "../src/git/parseLog";

describe("commit name-status paths", () => {
	it("preserves NUL-separated whitespace, Unicode and rename paths verbatim", () => {
		expect(parseNameStatus("M\0 leading\tline\n文件.txt\0R100\0old\tname\0new\nname\0A\0x[1].txt\0")).toEqual([
			{ code: "M", path: " leading\tline\n文件.txt" },
			{ code: "R", origPath: "old\tname", path: "new\nname" },
			{ code: "A", path: "x[1].txt" },
		]);
	});
	it.each(["M\0incomplete", "M\0", "R100\0old\0", "bad\0path\0"])(
		"rejects incomplete or invalid records: %j",
		(raw) => {
			expect(() => parseNameStatus(raw)).toThrow();
		},
	);
	it("accepts an empty commit", () => expect(parseNameStatus("")).toEqual([]));
});
