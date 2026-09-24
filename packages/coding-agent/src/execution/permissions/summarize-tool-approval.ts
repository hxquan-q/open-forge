// Copyright The Open Forge contributors.
/**
 * 审批请求的脱敏摘要：只保留工具名、少量可读字段与稳定资源路径，
 * 不携带完整参数或文件内容。
 */

const PREVIEW_KEYS = [
	"command",
	"path",
	"file_path",
	"pattern",
	"url",
	"name",
	"description",
	"action",
	"cron",
	"task_id",
] as const;
const RESOURCE_KEYS = ["path", "file_path", "directory", "dir", "url", "target"] as const;

export function summarizeToolApproval(
	toolName: string,
	input: Readonly<Record<string, unknown>>,
): { readonly summary: string; readonly affectedResources: readonly string[] } {
	const parts: string[] = [];
	for (const key of PREVIEW_KEYS) {
		const value = input[key];
		if (typeof value === "string" && value.length > 0) {
			parts.push(`${key}: ${value.length > 120 ? `${value.slice(0, 120)}…` : value}`);
		}
	}
	const summary = parts.length > 0 ? `${toolName} — ${parts.join("; ")}` : toolName;

	const resources: string[] = [];
	for (const key of RESOURCE_KEYS) {
		const value = input[key];
		if (typeof value === "string" && value.length > 0 && !resources.includes(value)) resources.push(value);
	}
	return { summary, affectedResources: resources };
}
