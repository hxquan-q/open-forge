import type { DeepSeekModel } from "deepeval/models";

export interface JudgeScoreRequest {
	readonly criteria: string;
	readonly input: string;
	readonly actualOutput: string;
	readonly toolsCalled: readonly string[];
	readonly expectedFirstTool?: string;
}

export interface JudgeScore {
	readonly score: number;
	readonly reason: string;
}

export function extractJsonObject(text: string): unknown {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = (fenced?.[1] ?? text).trim();
	const start = candidate.indexOf("{");
	const end = candidate.lastIndexOf("}");
	if (start < 0 || end <= start) throw new Error("judge output did not contain a JSON object");
	return JSON.parse(candidate.slice(start, end + 1));
}

export async function scoreWithJudge(judge: DeepSeekModel, request: JudgeScoreRequest): Promise<JudgeScore> {
	const prompt = [
		"You are scoring one isolated Agent eval case.",
		'Return only JSON: {"score": number, "reason": string}.',
		"score must be between 0 and 1.",
		`Criteria: ${request.criteria}`,
		`User input: ${request.input}`,
		`Actual output: ${request.actualOutput}`,
		`Tools called: ${request.toolsCalled.join(", ") || "(none)"}`,
		request.expectedFirstTool ? `Expected first tool: ${request.expectedFirstTool}` : "",
	]
		.filter(Boolean)
		.join("\n");
	const result = await judge.generate(prompt);
	const parsed = extractJsonObject(String(result.output));
	if (!parsed || typeof parsed !== "object") throw new Error("judge JSON was not an object");
	const record = parsed as Record<string, unknown>;
	const score = typeof record.score === "number" ? record.score : Number(record.score);
	if (!Number.isFinite(score)) throw new Error("judge score was not a number");
	return {
		score: Math.min(1, Math.max(0, score)),
		reason: typeof record.reason === "string" ? record.reason : "no reason",
	};
}
