import { loadEvalDotEnv } from "./load-dotenv.js";

// Allow suites launched outside run.mjs to pick up scripts/eval/.env.
loadEvalDotEnv();

export function isLiveEvalEnabled(): boolean {
	return process.env.OPENFORGE_EVAL === "1";
}

export function requireLiveEvalKey(): void {
	if (!process.env.DEEPSEEK_API_KEY) {
		throw new Error("OPENFORGE_EVAL=1 requires DEEPSEEK_API_KEY in the environment or scripts/eval/.env");
	}
}

export function evalSubjectModelId(): string {
	return process.env.OPENFORGE_EVAL_SUBJECT_MODEL ?? "deepseek-chat";
}

export function evalJudgeModelId(): string {
	return process.env.OPENFORGE_EVAL_JUDGE_MODEL ?? "deepseek-chat";
}

export function evalBaseUrl(): string {
	return process.env.OPENFORGE_EVAL_BASE_URL ?? "https://api.deepseek.com";
}
