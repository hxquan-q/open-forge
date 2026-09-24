import { expect, it } from "vitest";
import { isLiveEvalEnabled, requireLiveEvalKey } from "../harness/env.js";
import { scoreWithJudge } from "../harness/score-case.js";
import { createEvalJudge } from "../harness/vetta-judge.js";

const live = isLiveEvalEnabled();

it.skipIf(!live)("DeepSeek judge scores a canned correct answer above threshold", async () => {
	requireLiveEvalKey();
	const result = await scoreWithJudge(createEvalJudge(), {
		criteria: "Determine if the actual output is correct based on the expected output 4.",
		input: "What is 2 + 2?",
		actualOutput: "4",
		toolsCalled: [],
	});
	expect(result.score, result.reason).toBeGreaterThanOrEqual(0.5);
});
