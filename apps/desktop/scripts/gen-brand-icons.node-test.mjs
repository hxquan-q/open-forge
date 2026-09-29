// Copyright The Open Forge contributors.
//
// 分发档图标生成链的回归合同：已入库的四个图标必须能由
// scripts/gen-brand-icons.mjs + scripts/brand-icons/Allstar2.png 复现。
// 源图被换、算法漂移、或资产与脚本脱节都会让这条判负——那时重跑生成器并
// 把产物与脚本一并提交即可。
//
// 必须用 Bun 运行：Node 的 zlib 产出像素相同但字节不同的 PNG/ICO/ICNS，
// 会让这条字节比对毫无理由地失败。
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const scriptsDir = import.meta.dirname;
const committedIconsDir = join(scriptsDir, "..", "build", "brand", "distribution");
const ICON_NAMES = ["icon.ico", "icon.png", "icon.icns", "icon-dock.png"];

test("分发档图标可由生成链逐字节复现", () => {
	const outDir = mkdtempSync(join(tmpdir(), "of-brand-icons-"));
	try {
		execFileSync("bun", [join(scriptsDir, "gen-brand-icons.mjs"), outDir], { stdio: "pipe" });
		for (const name of ICON_NAMES) {
			const regenerated = join(outDir, name);
			assert.ok(existsSync(regenerated), `生成器没有输出 ${name}`);
			assert.deepEqual(
				readFileSync(regenerated),
				readFileSync(join(committedIconsDir, name)),
				`${name} 与已入库资产不一致：重跑 bun scripts/gen-brand-icons.mjs 并提交产物`,
			);
		}
	} finally {
		rmSync(outDir, { recursive: true, force: true });
	}
});
