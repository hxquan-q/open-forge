// Copyright The Open Forge contributors.

/**
 * 引擎 vite 模板的安全基线（TASK-0309）：
 * 模板以文件形态随 ENGINE_FILES 下发到用户机器，这里直接对源文件断言，
 * 防 CORS 重开 / fs.strict 回退。config 是 .mjs 且依赖只装在用户机上，
 * 不能 import，静态断言是这一层的正确形态。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const config = readFileSync(join(__dirname, "..", "engine", "vite.config.mjs"), "utf8");

describe("engine vite config security baseline", () => {
	it("CORS 保持关闭：不再对任意来源放行跨源读（原 cors: true 会带 ACAO:*）", () => {
		expect(config).toContain("cors: false");
		// 只看代码行（行首锚定），别把解释性注释里的历史写法算进去。
		expect(config).not.toMatch(/^\s*cors:\s*true\b/m);
	});

	it("server.fs 显式 strict：allow 名单之外的路径一律拒", () => {
		expect(config).toMatch(/fs:\s*\{\s*strict:\s*true/);
	});
});
