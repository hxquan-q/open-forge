// Copyright The Open Forge contributors.

import { isAbsolute } from "node:path";
import { type Static, Type } from "@sinclair/typebox";
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import { ToolCallDescriptionSchema } from "@vetta/runtime-tools/coding";
import type { ConversationScenario } from "../../profiles/index.js";
import type { CodingAgentRuntimeToolRegistration } from "../../runtime-contracts/index.js";
import type { CodingAgentResearchScopeOperations } from "./contracts.js";
import { RESEARCH_SOURCES_FENCE } from "./research-manifest.js";

/**
 * research_scope：列出用户选定资料集（本地目录）的检索范围。
 *
 * 产品边界：工具只回答「这个目录里有哪些可引用来源」，不读内容、不做检索
 * 排序——读取走 read/extract 系列，引用与产物落盘走 artifact。root 是必填
 * 显式入参（用户在 Work 面板选定的目录经消息路径 token 带来），任何情况下
 * 都不回落默认 knowledge home。
 */
export const CODING_AGENT_RESEARCH_SCOPE_TOOL_DESCRIPTION = `Enumerate the citable source files inside a local material folder the user explicitly selected (a path token in the message). Use this FIRST when the user asks you to research, summarize or answer from a local material set — it defines the retrieval scope and gives each source a stable file:// URI, size and mtime fingerprint for citation.

The root argument is required and must be an absolute path. This tool never falls back to any default knowledge home; if the user has not picked a folder, ask for one instead of guessing.

After scoping: read the relevant sources with read / extract_text_from_pdf / extract_text_from_img, then produce a cited answer where every claim traces back to a listed source. Persist the reviewed result as a research-evidence canvas artifact (artifact tool, kind: research-evidence) whose content ends with a fenced manifest block recording the cited sources:

\`\`\`${RESEARCH_SOURCES_FENCE}
{"version":1,"root":"<absolute folder>","sources":[{"uri":"file:///...","path":"<abs path>","name":"<file name>","sizeBytes":123,"modifiedAtMs":4567890000000}]}
\`\`\`

Copy uri/path/sizeBytes/modifiedAtMs verbatim from this tool's output for each cited source — the host re-verifies them later, so never invent fingerprints. Sources listed under "failures" could not be read; report that to the user instead of silently dropping them.`;

export const CodingAgentResearchScopeToolInputSchema = Type.Object(
	{
		description: ToolCallDescriptionSchema,
		root: Type.String({ minLength: 1, description: "Absolute path of the user-selected material folder." }),
	},
	{ additionalProperties: false },
);

export type CodingAgentResearchScopeToolInput = Static<typeof CodingAgentResearchScopeToolInputSchema>;

export interface CodingAgentResearchScopeToolOptions {
	readonly operations: CodingAgentResearchScopeOperations;
	readonly modelOrder?: number;
}

export const CODING_AGENT_RESEARCH_SCOPE_TOOL_SCOPES = [
	"conversation",
	"project",
	"cli",
] as const satisfies readonly ConversationScenario[];
export const CODING_AGENT_RESEARCH_SCOPE_TOOL_CATEGORY = "kb-read";

const MAX_LISTED_SOURCES = 200;

const formatBytes = (bytes: number): string =>
	bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;

function createCodingAgentResearchScopeTool(
	options: CodingAgentResearchScopeToolOptions,
): RuntimeToolDefinition<CodingAgentResearchScopeToolInput> {
	return {
		name: "research_scope",
		label: "Research Scope",
		description: CODING_AGENT_RESEARCH_SCOPE_TOOL_DESCRIPTION,
		inputSchema: CodingAgentResearchScopeToolInputSchema,
		async execute({ input }) {
			if (!isAbsolute(input.root)) {
				return {
					content: [
						{
							type: "text",
							text: "research_scope: root must be an absolute path to the user-selected material folder.",
						},
					],
					isError: true,
				};
			}
			const result = await options.operations.scanSources(input.root);
			if (!result.ok) {
				const detail =
					result.reason === "not-a-directory"
						? "the given path is a file, not a folder — pass the containing folder."
						: "the folder does not exist (or was moved). Ask the user to re-select the material set.";
				return { content: [{ type: "text", text: `research_scope: ${detail}` }], isError: true };
			}
			const { sources, failures } = result;
			if (sources.length === 0 && failures.length === 0) {
				return {
					content: [
						{
							type: "text",
							text:
								`research_scope found no citable sources under ${result.root}. ` +
								"Supported types: documents, PDFs, spreadsheets, images and common text/data formats. " +
								"If the set is really empty, tell the user; do not fabricate sources.",
						},
					],
					details: { count: 0, truncated: false, sources: [], failures: [] },
				};
			}
			const listing = sources
				.slice(0, MAX_LISTED_SOURCES)
				.map(
					(s) =>
						`- ${s.uri} — ${s.relativePath} (${s.extension}, ${formatBytes(s.sizeBytes)}, mtime=${Math.round(s.modifiedAtMs)})`,
				)
				.join("\n");
			const failureLines = failures
				.map((f) => `- ${f.relativePath} (${f.reason === "too_large" ? "over size limit" : "unreadable"})`)
				.join("\n");
			const text = [
				`research_scope: ${sources.length} citable source(s) under ${result.root}${result.truncated ? ` (truncated at limit; narrow the folder)` : ""}.`,
				sources.length > MAX_LISTED_SOURCES
					? `Listing first ${MAX_LISTED_SOURCES}; the full set is in details.sources.`
					: undefined,
				listing,
				failures.length > 0 ? `Unreadable/oversized (${failures.length}):\n${failureLines}` : undefined,
				"Read the sources relevant to the question, cite them by file:// URI, and finish with the research-evidence artifact ending in the manifest block described above.",
			]
				.filter((line) => line !== undefined && line.length > 0)
				.join("\n");
			return {
				content: [{ type: "text", text }],
				details: { count: sources.length, truncated: result.truncated, sources, failures },
			};
		},
	};
}

export function createCodingAgentResearchScopeToolRegistration(
	options: CodingAgentResearchScopeToolOptions,
): CodingAgentRuntimeToolRegistration<CodingAgentResearchScopeToolInput> {
	const tool = createCodingAgentResearchScopeTool(options);
	return {
		tool: { ...tool, modelOrder: options.modelOrder },
		scopeUse: CODING_AGENT_RESEARCH_SCOPE_TOOL_SCOPES,
		modelOrder: options.modelOrder,
		category: CODING_AGENT_RESEARCH_SCOPE_TOOL_CATEGORY,
	};
}
