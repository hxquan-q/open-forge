// Copyright The Open Forge contributors.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveBrandIconDirectory } from "./brand-icon-directory.js";

const appRoot = join("C:", "repo", "apps", "desktop");
const packagedDirectory = join("C:", "app", "resources", "build");

describe("主进程品牌图标目录解析", () => {
	it("dev 态默认（外部分发档）取 build/brand/distribution/，不再落到 self 的 build/", () => {
		expect(
			resolveBrandIconDirectory({ isPackaged: false, packagedDirectory, appRoot, profile: "distribution" }),
		).toBe(join(appRoot, "build", "brand", "distribution"));
	});

	it("dev 态显式 self 取 build/（原口径）", () => {
		expect(resolveBrandIconDirectory({ isPackaged: false, packagedDirectory, appRoot, profile: "self" })).toBe(
			join(appRoot, "build"),
		);
	});

	it("打包态沿用暂存目录，不受档案影响（prepare-pack 已按档覆盖）", () => {
		for (const profile of ["self", "distribution"] as const) {
			expect(resolveBrandIconDirectory({ isPackaged: true, packagedDirectory, appRoot, profile })).toBe(
				packagedDirectory,
			);
		}
	});

	it("窗口/托盘与 Dock 图标消费点接入同一解析，不再各自直连 build/", () => {
		const windowManager = readFileSync(join(import.meta.dirname, "window-manager.ts"), "utf8");
		expect(windowManager).toContain("resolveBrandIconDirectory");
		const mainSource = readFileSync(join(import.meta.dirname, "main.ts"), "utf8");
		expect(mainSource).toContain("resolveBrandIconDirectory");
		expect(mainSource).toContain('"icon-dock.png"');
	});
});
