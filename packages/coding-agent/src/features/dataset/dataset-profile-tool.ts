// Copyright The Open Forge contributors.

import { isAbsolute } from "node:path";
import { type Static, Type } from "@sinclair/typebox";
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import { ToolCallDescriptionSchema } from "@vetta/runtime-tools/coding";
import type { ConversationScenario } from "../../profiles/index.js";
import type { CodingAgentRuntimeToolRegistration } from "../../runtime-contracts/index.js";
import { RESEARCH_SOURCES_FENCE } from "../research/research-manifest.js";
import type { CodingAgentDatasetOperations } from "./contracts.js";

/**
 * dataset_profile：剖析用户显式选择的数据文件（CSV/JSON/Excel）。
 *
 * 产品边界：工具只做「这个文件里有什么、哪里脏」的只读画像——列名、
 * 推断类型、问题行、缺列、截断。不清洗、不写文件、不联网；清洗与指标
 * 计算由模型读取数据后用既有 write/artifact 路径完成，结果须经审阅。
 */
export const CODING_AGENT_DATASET_PROFILE_TOOL_DESCRIPTION = `Profile a local data file the user explicitly selected (CSV, TSV, JSON/JSONL or Excel .xlsx — a path token in the message). Use this FIRST when the user asks to analyze, clean or compute over a data file — it reports the format, columns with inferred types, problematic rows (ragged/empty/invalid values), missing expected columns, and truncation, so your analysis plan is grounded in the real shape instead of guesses.

The path argument is required and must be an absolute path to the data file. This tool is strictly read-only: it never modifies the source file and never sends data anywhere. If the user has not picked a file, ask for one instead of guessing a path. If you need columns to exist, pass them via expectedColumns and treat missingColumns as a blocker to report back rather than silently substituting.

After profiling: read or transform the data with the existing tools as needed, then persist the reviewed outcome as a dataset artifact (artifact tool, kind: dataset — the cleaned/normalized data) and/or an analysis artifact (kind: analysis — metrics, conclusions, chart references). End the artifact content with a fenced manifest block recording the input source(s) so the host can re-verify them later:

\`\`\`${RESEARCH_SOURCES_FENCE}
{"version":1,"root":"<absolute folder>","sources":[{"uri":"file:///...","path":"<abs path>","name":"<file name>","sizeBytes":123,"modifiedAtMs":4567890000000}]}
\`\`\`

Copy the fingerprint fields (uri/path/sizeBytes/modifiedAtMs) verbatim from the profile output — never invent them. Rows listed under "issues" were excluded or flagged; report their count honestly instead of silently dropping them.`;

export const CodingAgentDatasetProfileToolInputSchema = Type.Object(
	{
		description: ToolCallDescriptionSchema,
		path: Type.String({
			minLength: 1,
			description: "Absolute path of the user-selected data file (.csv/.tsv/.json/.jsonl/.ndjson/.xlsx/.xlsm).",
		}),
		expectedColumns: Type.Optional(
			Type.Array(Type.String({ minLength: 1 }), {
				description: "Column names your analysis requires; missing ones are reported under missingColumns.",
			}),
		),
	},
	{ additionalProperties: false },
);

export type CodingAgentDatasetProfileToolInput = Static<typeof CodingAgentDatasetProfileToolInputSchema>;

export interface CodingAgentDatasetProfileToolOptions {
	readonly operations: CodingAgentDatasetOperations;
	readonly modelOrder?: number;
}

export const CODING_AGENT_DATASET_PROFILE_TOOL_SCOPES = [
	"conversation",
	"project",
	"cli",
] as const satisfies readonly ConversationScenario[];
export const CODING_AGENT_DATASET_PROFILE_TOOL_CATEGORY = "kb-read";

const MAX_LISTED_ISSUES = 20;

const formatBytes = (bytes: number): string =>
	bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;

function createCodingAgentDatasetProfileTool(
	options: CodingAgentDatasetProfileToolOptions,
): RuntimeToolDefinition<CodingAgentDatasetProfileToolInput> {
	return {
		name: "dataset_profile",
		label: "Dataset Profile",
		description: CODING_AGENT_DATASET_PROFILE_TOOL_DESCRIPTION,
		inputSchema: CodingAgentDatasetProfileToolInputSchema,
		async execute({ input, signal }) {
			if (!isAbsolute(input.path)) {
				return {
					content: [
						{
							type: "text",
							text: "dataset_profile: path must be an absolute path to the user-selected data file.",
						},
					],
					isError: true,
				};
			}
			const result = await options.operations.profileDataset(input.path, {
				expectedColumns: input.expectedColumns,
				signal,
			});
			if (!result.ok) {
				const detail = (() => {
					switch (result.reason) {
						case "missing":
							return "the file does not exist (or was moved). Ask the user to re-select the data file.";
						case "not-a-file":
							return "the given path is a folder, not a data file — pass the file path, not its directory.";
						case "unsupported-format":
							return `unsupported format ${result.detail ?? ""} — supported: .csv .tsv .json .jsonl .ndjson .xlsx .xlsm.`;
						case "too-large":
							return "the file exceeds the size limit; export a smaller slice or aggregate it upstream first.";
						case "empty":
							return "the file is empty.";
						case "no-header":
							return "no header row was detected; the first row must name the columns.";
						case "cancelled":
							return "profiling was cancelled before it could finish.";
						default:
							return `could not parse the file${result.detail ? `: ${result.detail}` : ""}.`;
					}
				})();
				return { content: [{ type: "text", text: `dataset_profile: ${detail}` }], isError: true };
			}
			const { profile } = result;
			const columnLines = profile.columns
				.map((c) => {
					const flags = [
						c.emptyCells > 0 ? `${c.emptyCells} empty` : undefined,
						c.invalidCells > 0 ? `${c.invalidCells} invalid` : undefined,
					]
						.filter((f) => f !== undefined)
						.join(", ");
					return `- ${c.name}: ${c.type}${flags ? ` (${flags})` : ""}`;
				})
				.join("\n");
			const issueLines = profile.issues
				.slice(0, MAX_LISTED_ISSUES)
				.map((issue) => `- row ${issue.row}: ${issue.reason}${issue.column ? ` (${issue.column})` : ""}`)
				.join("\n");
			const text = [
				`dataset_profile: ${profile.format} · ${profile.rowCount} row(s)${profile.truncated ? ` (truncated at limit)` : ""} · ${profile.columns.length} column(s) · ${formatBytes(profile.sizeBytes)}`,
				`source: ${profile.uri} — ${profile.path} (${formatBytes(profile.sizeBytes)}, mtime=${Math.round(profile.modifiedAtMs)})`,
				columnLines ? `columns:\n${columnLines}` : "columns: (none detected)",
				profile.missingColumns.length > 0
					? `missing expected columns: ${profile.missingColumns.join(", ")}`
					: undefined,
				profile.issueCount > 0
					? `issues (${profile.issueCount} total${profile.issueCount > MAX_LISTED_ISSUES ? `, first ${MAX_LISTED_ISSUES}` : ""}):\n${issueLines}`
					: "issues: none",
				"These facts describe the source only — do not treat profiling as cleaning. Persist reviewed output as dataset/analysis artifacts ending with the manifest block described above.",
			]
				.filter((line) => line !== undefined && line.length > 0)
				.join("\n");
			return {
				content: [{ type: "text", text }],
				details: { profile },
			};
		},
	};
}

export function createCodingAgentDatasetProfileToolRegistration(
	options: CodingAgentDatasetProfileToolOptions,
): CodingAgentRuntimeToolRegistration<CodingAgentDatasetProfileToolInput> {
	const tool = createCodingAgentDatasetProfileTool(options);
	return {
		tool: { ...tool, modelOrder: options.modelOrder },
		scopeUse: CODING_AGENT_DATASET_PROFILE_TOOL_SCOPES,
		modelOrder: options.modelOrder,
		category: CODING_AGENT_DATASET_PROFILE_TOOL_CATEGORY,
	};
}
