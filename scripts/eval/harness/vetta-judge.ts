import { DeepSeekModel } from "deepeval/models";
import { evalBaseUrl, evalJudgeModelId } from "./env.js";

/** Judge reads DEEPSEEK_API_KEY itself. Do not pass the key in source. */
export function createEvalJudge(): DeepSeekModel {
	return new DeepSeekModel({
		model: evalJudgeModelId(),
		baseURL: evalBaseUrl(),
		temperature: 0,
	});
}
