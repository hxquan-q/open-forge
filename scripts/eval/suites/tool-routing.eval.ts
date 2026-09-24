import { afterAll, expect, it } from "vitest";
import { isLiveEvalEnabled, requireLiveEvalKey } from "../harness/env.js";
import { loadToolRoutingGoldens } from "../harness/goldens.js";
import { isolationViolations } from "../harness/isolation.js";
import { firstToolViolates } from "../harness/project-trace.js";
import { type EvalCaseReport, writeEvalReport } from "../harness/report.js";
import { runIsolatedRoutingPrompt } from "../harness/run-session.js";
import { scoreWithJudge } from "../harness/score-case.js";
import { createEvalJudge } from "../harness/vetta-judge.js";

const live = isLiveEvalEnabled();
const reports: EvalCaseReport[] = [];

it.skipIf(!live).each([...loadToolRoutingGoldens()])("routes $id to the expected first tool", async (golden) => {
	requireLiveEvalKey();
	const { trace, isolation, errorMessage } = await runIsolatedRoutingPrompt(golden.input);
	const leaked = isolationViolations(isolation);
	const violations = firstToolViolates(trace, golden.expectedFirstTool, golden.forbiddenTools);
	let judgeScore: number | undefined;
	let judgeReason: string | undefined;

	try {
		expect(leaked, leaked.join("; ")).toEqual([]);
		expect(errorMessage, errorMessage).toBeUndefined();
		expect(violations, violations.join("; ")).toEqual([]);
		const judged = await scoreWithJudge(createEvalJudge(), {
			criteria: golden.criteria,
			input: golden.input,
			actualOutput: trace.actualOutput || "(no assistant text)",
			toolsCalled: trace.toolsCalled.map((call) => call.name),
			expectedFirstTool: golden.expectedFirstTool || "(none)",
		});
		judgeScore = judged.score;
		judgeReason = judged.reason;
		expect(judged.score, judged.reason).toBeGreaterThanOrEqual(0.6);
	} finally {
		reports.push({
			id: golden.id,
			firstToolName: trace.firstToolName,
			toolsCalled: trace.toolsCalled.map((call) => call.name),
			skillNames: isolation.skillNames,
			activeToolNames: isolation.activeToolNames,
			violations: [...leaked, ...violations],
			judgeScore,
			judgeReason,
			errorMessage,
		});
	}
});

afterAll(async () => {
	if (!live || reports.length === 0) return;
	await writeEvalReport("tool-routing", reports);
});
