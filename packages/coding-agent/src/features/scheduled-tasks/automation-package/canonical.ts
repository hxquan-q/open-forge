// Copyright The Open Forge contributors.
import { createHash } from "node:crypto";

/**
 * Canonical JSON：对象键按字典序排序，数组保序；用于 sha256 文档身份去重。
 * 与 JSON.stringify 空格无关——同一逻辑值始终得到同一字节串。
 */
export function canonicalizeJson(value: unknown): string {
	return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
	if (value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) return value.map(sortKeys);
	const record = value as Record<string, unknown>;
	const sorted: Record<string, unknown> = {};
	for (const key of Object.keys(record).sort()) {
		sorted[key] = sortKeys(record[key]);
	}
	return sorted;
}

export function sha256CanonicalJson(value: unknown): string {
	return createHash("sha256").update(canonicalizeJson(value), "utf8").digest("hex");
}
