// Copyright The Open Forge contributors.
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { VETTA_PROJECT_DIRECTORY, VettaProjectManifestError } from "./shared-project-conventions.js";

/**
 * 项目工具策略（TASK-0021）：`.vetta/policies/tools.json`，只能收紧。
 * deny 清单对任何能力来源（Profile 默认、显式选择、插件/MCP 贡献）生效。
 */

export const PROJECT_TOOL_POLICY_FILE = "tools.json";

export const ProjectToolPolicySchema = Type.Object(
	{
		schemaVersion: Type.Literal(1),
		/** 拒绝进入模型 Catalog 的工具名（含 mcp__ 前缀名）。 */
		denyTools: Type.Array(Type.String({ minLength: 1 }), { maxItems: 1000, uniqueItems: true }),
	},
	{ additionalProperties: false },
);

export type ProjectToolPolicy = Static<typeof ProjectToolPolicySchema>;

export function readProjectToolPolicy(value: unknown): ProjectToolPolicy {
	if (!Value.Check(ProjectToolPolicySchema, value)) {
		throw new VettaProjectManifestError("invalid-manifest", "project tool policy does not match the v1 schema");
	}
	return value;
}

/** 读取项目工具策略；文件不存在时返回 undefined（不收紧）。 */
export async function loadProjectToolPolicy(projectRoot: string): Promise<ProjectToolPolicy | undefined> {
	const root = resolve(projectRoot);
	const policyPath = join(root, VETTA_PROJECT_DIRECTORY, "policies", PROJECT_TOOL_POLICY_FILE);
	let raw: string;
	try {
		raw = await readFile(policyPath, "utf8");
	} catch {
		return undefined;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new VettaProjectManifestError(
			"invalid-manifest",
			`project tool policy is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	return readProjectToolPolicy(parsed);
}
