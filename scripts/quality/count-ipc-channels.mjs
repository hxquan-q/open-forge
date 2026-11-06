// Copyright The Open Forge contributors.
/**
 * PLAN-0029 进度指标：统计 Desktop 主进程仍在注册的旧 IPC channel（只读，不进 check 门禁）。
 *
 * 口径：apps/desktop/src/main 非测试文件中 `ipcMain.handle(` 与包装 `handle("vetta:` 的出现次数。
 * Host 合同的单一桥接 channel 也会被计入，迁移进度看的是数值下降趋势。
 *
 * Usage: node scripts/quality/count-ipc-channels.mjs [--json]
 */
import { join } from "node:path";
import { isDirectRun, readText, rel, repoRoot, walkFiles } from "./lib.mjs";

const DIRECT = /\bipcMain\.handle\(/g;
const WRAPPED = /(?<![.\w])handle\(\s*["'`]vetta:/g;

export function countIpcChannels(root = repoRoot) {
	const files = walkFiles(join(root, "apps/desktop/src/main"), { extensions: [".ts"] }).filter(
		(file) => !/\.test\.ts$/.test(file),
	);
	let direct = 0;
	let wrapped = 0;
	const perFile = [];
	for (const file of files) {
		const text = readText(file);
		const d = text.match(DIRECT)?.length ?? 0;
		const w = text.match(WRAPPED)?.length ?? 0;
		if (d + w === 0) continue;
		direct += d;
		wrapped += w;
		perFile.push({ file: rel(file), count: d + w });
	}
	perFile.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
	return { total: direct + wrapped, direct, wrapped, files: perFile };
}

if (isDirectRun(import.meta.url)) {
	const result = countIpcChannels();
	if (process.argv.includes("--json")) {
		console.log(JSON.stringify(result, null, 2));
	} else {
		console.log(`[ipc-channels] total ${result.total} (ipcMain.handle ${result.direct}, wrapped ${result.wrapped})`);
		for (const entry of result.files.slice(0, 10)) console.log(`  ${entry.count}\t${entry.file}`);
	}
}
