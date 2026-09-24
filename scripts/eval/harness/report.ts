import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evalJudgeModelId, evalSubjectModelId } from "./env.js";
import type { ProjectedSessionTrace } from "./project-trace.js";

export interface EvalCaseReport {
	readonly id: string;
	readonly firstToolName: string | undefined;
	readonly toolsCalled: readonly string[];
	readonly skillNames: readonly string[];
	readonly activeToolNames: readonly string[];
	readonly violations: readonly string[];
	readonly judgeScore: number | undefined;
	readonly judgeReason: string | undefined;
	readonly errorMessage: string | undefined;
}

export async function writeEvalReport(kind: string, cases: readonly EvalCaseReport[]): Promise<string> {
	const resultsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "results");
	await mkdir(resultsDir, { recursive: true });
	const outputPath = join(resultsDir, `${kind}-${new Date().toISOString().replaceAll(":", "-")}.json`);
	const body = {
		kind,
		createdAt: new Date().toISOString(),
		subjectModel: evalSubjectModelId(),
		judgeModel: evalJudgeModelId(),
		cases,
	};
	await writeFile(outputPath, `${JSON.stringify(body, null, 2)}\n`);
	return outputPath;
}

export function summarizeTrace(trace: ProjectedSessionTrace): Pick<EvalCaseReport, "firstToolName" | "toolsCalled"> {
	return {
		firstToolName: trace.firstToolName,
		toolsCalled: trace.toolsCalled.map((call) => call.name),
	};
}
