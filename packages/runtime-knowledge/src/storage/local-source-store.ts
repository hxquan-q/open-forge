// Copyright The Open Forge contributors.

/**
 * 本地研究来源扫描的 IO 边界（TASK-0025）。
 *
 * 只接受显式注入的 root，绝不回落默认 knowledge home——「不访问默认 home 根」
 * 是产品合同，靠签名（无参默认）与实现双重保证。扫描结果分来源与失败两类，
 * 部分失败不丢弃已完成的来源记录。
 */

import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, posix, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
	compareLocalSourceState,
	isResearchExcludedDir,
	isResearchSourceFile,
	LOCAL_SOURCE_MAX_DEPTH,
	LOCAL_SOURCE_MAX_FILE_BYTES,
	LOCAL_SOURCE_MAX_FILES,
	type LocalSourceCheck,
	type LocalSourceEntry,
	type LocalSourceFailure,
	type LocalSourceFingerprint,
} from "../domain/local-source-scope.js";

const toPosix = (p: string): string => (sep === "/" ? p : p.split(sep).join(posix.sep));

export type LocalSourceScanResult =
	| {
			readonly ok: true;
			readonly root: string;
			readonly sources: readonly LocalSourceEntry[];
			readonly failures: readonly LocalSourceFailure[];
			/** 达到 LOCAL_SOURCE_MAX_FILES 上限时为 true，剩余文件未枚举。 */
			readonly truncated: boolean;
	  }
	| { readonly ok: false; readonly reason: "missing" | "not-a-directory" };

/** 枚举注入根下的可引用来源。root 不存在/非目录时显式返回失败，不静默造空集。 */
export async function scanLocalSources(root: string): Promise<LocalSourceScanResult> {
	const base = resolve(root);
	const rootStat = await stat(base).catch(() => undefined);
	if (!rootStat) return { ok: false, reason: "missing" };
	if (!rootStat.isDirectory()) return { ok: false, reason: "not-a-directory" };

	const sources: LocalSourceEntry[] = [];
	const failures: LocalSourceFailure[] = [];
	let truncated = false;

	async function walk(dir: string, depth: number): Promise<void> {
		if (truncated || depth > LOCAL_SOURCE_MAX_DEPTH) return;
		let entries: Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			failures.push({ path: dir, relativePath: toPosix(relative(base, dir)) || ".", reason: "unreadable" });
			return;
		}
		for (const entry of entries) {
			if (sources.length >= LOCAL_SOURCE_MAX_FILES) {
				truncated = true;
				return;
			}
			if (entry.name.startsWith(".")) continue;
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!isResearchExcludedDir(entry.name)) await walk(full, depth + 1);
				continue;
			}
			if (!entry.isFile() || !isResearchSourceFile(entry.name)) continue;
			const rel = toPosix(relative(base, full));
			const info = await stat(full).catch(() => undefined);
			if (!info) {
				failures.push({ path: full, relativePath: rel, reason: "unreadable" });
				continue;
			}
			if (info.size > LOCAL_SOURCE_MAX_FILE_BYTES) {
				failures.push({ path: full, relativePath: rel, reason: "too_large" });
				continue;
			}
			sources.push({
				uri: pathToFileURL(full).href,
				path: full,
				relativePath: rel,
				extension: full.slice(full.lastIndexOf(".")).toLowerCase(),
				sizeBytes: info.size,
				modifiedAtMs: info.mtimeMs,
			});
		}
	}

	await walk(base, 0);
	sources.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
	return { ok: true, root: base, sources, failures, truncated };
}

/**
 * 复查已登记来源：逐个 stat，缺失/已变更如实标注。
 * 取消或单个失败不影响其他来源的判定结果（无整体 throw）。
 */
export async function checkLocalSources(
	recorded: readonly LocalSourceFingerprint[],
): Promise<readonly LocalSourceCheck[]> {
	const checks: LocalSourceCheck[] = [];
	for (const entry of recorded) {
		const info = await stat(entry.path).catch(() => undefined);
		const observed = info ? { sizeBytes: info.size, modifiedAtMs: info.mtimeMs } : undefined;
		checks.push({
			uri: pathToFileURL(entry.path).href,
			path: entry.path,
			status: compareLocalSourceState(entry, observed),
			...(observed ? { sizeBytes: observed.sizeBytes, modifiedAtMs: observed.modifiedAtMs } : {}),
		});
	}
	return checks;
}
