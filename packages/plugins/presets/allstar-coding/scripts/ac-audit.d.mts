// Copyright The Open Forge contributors.
/**
 * scripts/ac-audit.mjs 的旁置类型声明（纯 JS 工具，主控侧 node 执行）。
 * 随 vettapkg 打包分发（scripts/ 是打包约定目录）；声明面与实现具名导出一一对应。
 */
export interface ScopeMatcher {
	patterns: string[];
	matches(path: string): boolean;
}
export interface AuditVerdict {
	node: string;
	pass: boolean;
	inScope: string[];
	outOfScope: string[];
}
export function compileScope(patterns: string | string[]): ScopeMatcher;
export function globToRegExp(pattern: string): RegExp;
export function gitChangesSince(root: string, sinceISO: string, untilISO?: string): string[];
export function gitCheckpointChanges(root: string): string[];
export function gitWorkingChanges(root: string): string[];
export function matrixScopeFor(roles: string | string[]): ScopeMatcher;
export function scanModifiedSince(root: string, sinceISO: string): string[];
export function toRel(root: string, path: string): string | null;
export function splitScopeList(raw: string | string[] | null | undefined): string[];
export const BASELINE_MATRIX: Record<string, { tier: string; write: string[] }>;
export const ROLE_LABELS: Record<string, string>;
export function runGate(opts: {
	root: string;
	since: string;
	until?: string;
	roles: string | string[];
	extraScope?: string | string[];
	allowOutOfScope?: boolean;
}): AuditVerdict & {
	chainA: { source: string; files: string[] };
	chainB: { source: string; files: string[] };
	union: string[];
	scopePatterns: string[];
};
export function runSnapshot(opts: {
	root: string;
	scope: string | string[];
	allowOutOfScope?: boolean;
}): AuditVerdict & { files: string[]; scopePatterns: string[]; gitStatus: string };
export function runCheckpoint(opts: {
	root: string;
	scope: string | string[];
	allowOutOfScope?: boolean;
}): AuditVerdict & { files: string[]; scopePatterns: string[] };
