import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface ToolRoutingGolden {
	readonly id: string;
	readonly input: string;
	readonly expectedFirstTool: string;
	readonly forbiddenTools: readonly string[];
	readonly criteria: string;
}

export function loadToolRoutingGoldens(): readonly ToolRoutingGolden[] {
	const filePath = join(dirname(fileURLToPath(import.meta.url)), "..", "goldens", "tool-routing.json");
	const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
	if (!Array.isArray(parsed)) throw new Error("tool-routing goldens must be an array");
	return parsed.map((entry, index) => {
		if (!entry || typeof entry !== "object") throw new Error(`golden ${index} must be an object`);
		const record = entry as Record<string, unknown>;
		if (typeof record.id !== "string" || typeof record.input !== "string") {
			throw new Error(`golden ${index} needs id and input`);
		}
		if (typeof record.expectedFirstTool !== "string" || typeof record.criteria !== "string") {
			throw new Error(`golden ${record.id} needs expectedFirstTool and criteria`);
		}
		// Empty expectedFirstTool means the case must not call any tool.
		if (!Array.isArray(record.forbiddenTools) || record.forbiddenTools.some((name) => typeof name !== "string")) {
			throw new Error(`golden ${record.id} needs forbiddenTools string[]`);
		}
		return {
			id: record.id,
			input: record.input,
			expectedFirstTool: record.expectedFirstTool,
			forbiddenTools: record.forbiddenTools,
			criteria: record.criteria,
		};
	});
}
