/**
 * Promptfoo sidecar: assertion matrix over the isolated coding-agent session.
 * Does not share traces, write ~/.promptfoo, or login to Promptfoo Cloud.
 */
import { loadToolRoutingGoldens } from "../harness/goldens.ts";
import { isolationViolations } from "../harness/isolation.ts";
import { firstToolViolates } from "../harness/project-trace.ts";
import { writeEvalReport } from "../harness/report.ts";
import { runIsolatedRoutingPrompt } from "../harness/run-session.ts";

process.env.PROMPTFOO_DISABLE_TELEMETRY ??= "1";
process.env.PROMPTFOO_DISABLE_SHARING ??= "1";

const goldens = loadToolRoutingGoldens();

function parseProviderOutput(output) {
	if (output && typeof output === "object" && !Array.isArray(output)) {
		return output;
	}
	if (typeof output === "string") {
		return JSON.parse(output);
	}
	throw new Error("promptfoo provider output must be JSON");
}

function assertFirstTool(output, context) {
	const parsed = parseProviderOutput(output);
	const expected = String(context.vars.expectedFirstTool ?? "");
	const first = parsed.firstToolName ?? null;
	const pass = expected === "" ? first === null : first === expected;
	return {
		pass,
		score: pass ? 1 : 0,
		reason: pass ? "first tool matched" : `first tool was ${first ?? "(none)"}, expected ${expected || "(none)"}`,
	};
}

function assertForbiddenTools(output, context) {
	const parsed = parseProviderOutput(output);
	const forbidden = Array.isArray(context.vars.forbiddenTools) ? context.vars.forbiddenTools : [];
	const toolsCalled = Array.isArray(parsed.toolsCalled) ? parsed.toolsCalled : [];
	const hit = forbidden.filter((name) => toolsCalled.includes(name));
	const pass = hit.length === 0;
	return {
		pass,
		score: pass ? 1 : 0,
		reason: pass ? "no forbidden tools" : `called forbidden tools: ${hit.join(", ")}`,
	};
}

function assertIsolation(output) {
	const parsed = parseProviderOutput(output);
	const leaked = Array.isArray(parsed.isolationViolations) ? parsed.isolationViolations : [];
	const pass = leaked.length === 0 && !parsed.errorMessage;
	return {
		pass,
		score: pass ? 1 : 0,
		reason: pass ? "session stayed isolated" : leaked.join("; ") || String(parsed.errorMessage),
	};
}

async function callIsolatedAgent(prompt, context) {
	const input = String(context?.vars?.input ?? prompt);
	const expectedFirstTool = String(context?.vars?.expectedFirstTool ?? "");
	const forbiddenTools = Array.isArray(context?.vars?.forbiddenTools) ? context.vars.forbiddenTools : [];
	const run = await runIsolatedRoutingPrompt(input);
	const leaked = isolationViolations(run.isolation);
	const violations = firstToolViolates(run.trace, expectedFirstTool, forbiddenTools);
	return {
		output: {
			id: context?.vars?.id ?? null,
			actualOutput: run.trace.actualOutput,
			firstToolName: run.trace.firstToolName ?? null,
			toolsCalled: run.trace.toolsCalled.map((call) => call.name),
			isolationViolations: leaked,
			firstToolViolations: violations,
			errorMessage: run.errorMessage ?? null,
		},
		error: run.errorMessage,
		metadata: {
			skillNames: run.isolation.skillNames,
			activeToolNames: run.isolation.activeToolNames,
		},
	};
}

async function summarizeEval(evalRecord) {
	if (evalRecord && typeof evalRecord.toEvaluateSummary === "function") {
		return await evalRecord.toEvaluateSummary();
	}
	return evalRecord;
}

async function main() {
	const promptfoo = await import("promptfoo");
	const evaluate = promptfoo.evaluate ?? promptfoo.default?.evaluate;
	if (typeof evaluate !== "function") {
		throw new Error("promptfoo.evaluate is not available");
	}

	const evalRecord = await evaluate(
		{
			description: "Open Forge isolated Desktop Agent tool routing",
			sharing: false,
			writeLatestResults: false,
			prompts: ["{{input}}"],
			providers: [callIsolatedAgent],
			tests: goldens.map((golden) => ({
				description: golden.id,
				vars: {
					id: golden.id,
					input: golden.input,
					expectedFirstTool: golden.expectedFirstTool,
					forbiddenTools: [...golden.forbiddenTools],
				},
				assert: [
					{ type: "javascript", value: assertIsolation },
					{ type: "javascript", value: assertFirstTool },
					{ type: "javascript", value: assertForbiddenTools },
				],
			})),
		},
		{
			maxConcurrency: 1,
			cache: false,
			sharing: false,
			writeLatestResults: false,
		},
	);

	const summary = await summarizeEval(evalRecord);
	const rows = Array.isArray(summary?.results) ? summary.results : [];
	const reports = rows.map((row, index) => {
		const vars = row.vars ?? goldens[index] ?? {};
		const parsed = (() => {
			try {
				return parseProviderOutput(row.response?.output ?? row.output);
			} catch {
				return {};
			}
		})();
		return {
			id: String(vars.id ?? goldens[index]?.id ?? `case-${index}`),
			firstToolName: parsed.firstToolName ?? undefined,
			toolsCalled: Array.isArray(parsed.toolsCalled) ? parsed.toolsCalled : [],
			skillNames: row.response?.metadata?.skillNames ?? [],
			activeToolNames: row.response?.metadata?.activeToolNames ?? [],
			violations: [
				...(Array.isArray(parsed.isolationViolations) ? parsed.isolationViolations : []),
				...(Array.isArray(parsed.firstToolViolations) ? parsed.firstToolViolations : []),
			],
			judgeScore: typeof row.score === "number" ? row.score : undefined,
			judgeReason: row.gradingResult?.reason,
			errorMessage: row.error || parsed.errorMessage || undefined,
		};
	});

	const outputPath = await writeEvalReport("promptfoo-tool-routing", reports);
	const successes = Number(summary?.stats?.successes ?? reports.filter((row) => row.violations.length === 0).length);
	const failures = Number(summary?.stats?.failures ?? reports.length - successes);
	console.log(`[eval:agent:promptfoo] ${successes} passed, ${failures} failed; report ${outputPath}`);
	if (failures > 0) process.exitCode = 1;
}

await main();
