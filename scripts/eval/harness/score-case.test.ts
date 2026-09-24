import { describe, expect, it } from "vitest";
import { extractJsonObject } from "./score-case.js";

describe("judge JSON extraction", () => {
	it("reads a fenced score object", () => {
		expect(extractJsonObject('```json\n{"score": 0.8, "reason": "ok"}\n```')).toEqual({
			score: 0.8,
			reason: "ok",
		});
	});
});
