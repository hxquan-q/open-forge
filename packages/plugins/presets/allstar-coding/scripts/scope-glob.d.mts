// Copyright The Open Forge contributors.
/**
 * scripts/scope-glob.mjs 的旁置类型声明（fence 判定器与 ac-audit 共享的 glob 语义权威实现）。
 * 声明面与实现具名导出一一对应（同 ac-audit.d.mts 约定）。
 */
export interface ScopeMatcher {
	patterns: string[];
	matches(path: string): boolean;
}
export function compileScope(patterns: string | string[]): ScopeMatcher;
export function globToRegExp(pattern: string): RegExp;
export function splitScopeList(raw: string | string[] | null | undefined): string[];
