import type { Model } from "@vetta/ai";
import { evalBaseUrl, evalSubjectModelId } from "./env.js";

/** Subject model for the isolated SDK session. Credentials come from DEEPSEEK_API_KEY. */
export function createSubjectModel(): Model<"openai-completions-deepseek"> {
	const id = evalSubjectModelId();
	return {
		id,
		name: id,
		api: "openai-completions-deepseek",
		provider: "deepseek",
		baseUrl: evalBaseUrl(),
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 8192,
	};
}
