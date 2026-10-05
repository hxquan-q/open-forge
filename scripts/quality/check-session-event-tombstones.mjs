// Copyright The Open Forge contributors.
/**
 * 已退役 Runtime SessionEvent 类型墓碑守卫（适配上游 e0c24f4ab）。
 *
 * 从合同删除事件类型后，编译器能标出全部带类型的消费方，但测试与适配器里的
 * cast（`as never`、局部事件 union）会绕过编译器，让无人生产的协议借"通过
 * 的测试"继续存活。退役类型在此登记一次；此后任何引用都会判红，死分支无法
 * 复活。在世类型的生产者由 packages/runtime-core/test/session-event-producers.test.ts
 * 核实。
 *
 * 用法：
 *   node scripts/quality/check-session-event-tombstones.mjs            # 全仓审计
 *   node scripts/quality/check-session-event-tombstones.mjs <files...> # 只审计给定文件
 */

import { join, resolve } from "node:path";
import { fail, isDirectRun, ok, readText, rel, repoRoot, toPosix, walkFiles } from "./lib.mjs";

/** 退役事件类型 → 删除原因。条目只增不删。 */
export const RETIRED_SESSION_EVENT_TYPES = Object.freeze({
	"message.final": "被 assistant 通道 done/error 终态取代（上游 ADR-0146 同款；本仓 TASK-0204 查证无生产者）",
	"toolcall.args": "生成期参数增量无生产者；assistant 通道 toolcall_delta 已覆盖（本仓 TASK-0204 删除）",
});

const SOURCE_DIRECTORIES = Object.freeze(["apps", "packages"]);
const EXTENSIONS = Object.freeze([".ts", ".tsx", ".js", ".mjs", ".cjs", ".swift", ".kt"]);
const SELF = new Set([
	"scripts/quality/check-session-event-tombstones.mjs",
	"scripts/quality/session-event-tombstones.test.mjs",
]);

function quotedPattern(type) {
	const escaped = type.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
	return new RegExp(`["'\`]${escaped}["'\`]`, "u");
}

const PATTERNS = Object.entries(RETIRED_SESSION_EVENT_TYPES).map(([type, reason]) => ({
	type,
	reason,
	pattern: quotedPattern(type),
}));

export function findSessionEventTombstoneViolations(files) {
	const violations = [];
	for (const file of files) {
		if (SELF.has(file.path)) continue;
		for (const [index, line] of file.text.split(/\r?\n/u).entries()) {
			for (const { type, reason, pattern } of PATTERNS) {
				if (pattern.test(line))
					violations.push(`${file.path}:${index + 1}: retired SessionEvent "${type}" — ${reason}`);
			}
		}
	}
	return violations;
}

function collectFiles(selected) {
	const paths =
		selected.length > 0
			? selected.map((path) => toPosix(resolve(repoRoot, path)).slice(repoRoot.length + 1))
			: SOURCE_DIRECTORIES.flatMap((directory) =>
					walkFiles(join(repoRoot, directory), { extensions: [...EXTENSIONS] }),
				).map((path) => rel(path));
	return paths
		.filter((path) => EXTENSIONS.some((extension) => path.endsWith(extension)))
		.map((path) => ({ path, text: readText(path) }));
}

export async function run(selected = []) {
	const violations = findSessionEventTombstoneViolations(collectFiles(selected));
	if (violations.length > 0) {
		for (const violation of violations) fail(violation);
		fail(`session event tombstones: ${violations.length} violation(s)`);
		return 1;
	}
	ok("session event tombstones: no retired SessionEvent references");
	return 0;
}

if (isDirectRun(import.meta.url)) {
	const selected = process.argv.slice(2);
	process.exit(await run(selected));
}
