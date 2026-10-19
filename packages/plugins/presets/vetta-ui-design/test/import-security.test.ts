// Copyright The Open Forge contributors.

/**
 * 分享包导入的路径穿越防线与依赖安装确认（TASK-0309）：
 * `design/*` 条目来自外部 zip，越界形态（../、绝对路径、盘符、反斜杠）必须整包拒绝；
 * 包声明依赖时，安装需经确认且固定 --ignore-scripts。
 */
import { strFromU8, zipSync } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";

const installMock = vi.fn(async () => "");
vi.mock("../src/engine/engine-manager", () => ({
	installDesignDependencies: (...args: unknown[]) => installMock(...(args as [])),
}));

const fsCalls = { writes: [] as string[], renames: [] as Array<[string, string]> };
/** 当前设计 package.json 的内容——导入落地的是它，needsDependencyInstall 读的也是它。 */
let designPackageJson = '{"dependencies":{"recharts":"^3.0.0"}}';
const ctx = {
	fs: {
		stat: vi.fn(async () => null),
		readFile: vi.fn(async (path: string) => ({
			content: path.endsWith("package.json") ? designPackageJson : "",
			encoding: "utf8" as const,
		})),
		writeFile: vi.fn(async (path: string) => {
			fsCalls.writes.push(path);
		}),
		rename: vi.fn(async (oldPath: string, newPath: string) => {
			fsCalls.renames.push([oldPath, newPath]);
		}),
		delete: vi.fn(async () => {}),
	},
	official: { projects: { create: vi.fn(async () => ({ path: "/w" })) } },
};
vi.mock("../src/plugin-context", () => ({
	getPluginCtx: () => ctx,
}));

import { importDesignPackage } from "../src/gallery/gallery-actions";
import { parsePackagedVetd } from "../src/export/import-design";

const MANIFEST = JSON.stringify({ schemaVersion: 2, frames: [] });

function shareZip(entries: Record<string, string | Uint8Array>): Uint8Array {
	const encoded: Record<string, Uint8Array> = {};
	for (const [name, value] of Object.entries(entries)) {
		encoded[name] = typeof value === "string" ? new TextEncoder().encode(value) : value;
	}
	return zipSync(encoded);
}

beforeEach(() => {
	installMock.mockClear();
	fsCalls.writes.splice(0);
	fsCalls.renames.splice(0);
	vi.mocked(ctx.fs.stat).mockClear();
	vi.mocked(ctx.official.projects.create).mockClear();
});

describe("parsePackagedVetd 拒绝越界条目", () => {
	it.each([
		["design/../evil.txt", "父目录段"],
		["design/frames/../../evil.tsx", "嵌套父目录段"],
		["design//etc/passwd", "绝对路径"],
		["design/C:/evil.txt", "Windows 盘符"],
		["design/..\\evil.txt", "反斜杠"],
	])("%s → 整包拒绝", (entry) => {
		const bytes = shareZip({ "manifest.json": MANIFEST, [entry]: "evil" });
		expect(() => parsePackagedVetd(bytes)).toThrow(/unsafe entry path/);
	});

	it("合法条目照常解析（存量兼容）", () => {
		const packaged = parsePackagedVetd(
			shareZip({ "manifest.json": MANIFEST, "design/frames/home.tsx": "export default 1" }),
		);
		expect(strFromU8(packaged.designFiles.get("frames/home.tsx") ?? new Uint8Array())).toBe(
			"export default 1",
		);
	});
});

describe("importDesignPackage 的依赖确认", () => {
	const withDeps = shareZip({
		"manifest.json": MANIFEST,
		"design/frames/home.tsx": "export default 1",
		"design/package.json": '{"dependencies":{"recharts":"^3.0.0"}}',
	});

	it("声明依赖时先确认：同意才安装，且安装固定不带附加包", async () => {
		await importDesignPackage("checkout.vetdz", withDeps, {
			confirmDependencyInstall: async () => true,
		});
		expect(installMock).toHaveBeenCalledTimes(1);
		expect(installMock.mock.calls[0][1]).toContain(".vetd");
		expect(installMock.mock.calls[0][2]).toEqual([]);
	});

	it("拒绝确认则跳过当场安装，导入本身照常完成", async () => {
		const created = await importDesignPackage("checkout.vetdz", withDeps, {
			confirmDependencyInstall: async () => false,
		});
		expect(installMock).not.toHaveBeenCalled();
		expect(created.vetdPath).toContain(".vetd");
	});

	it("安装失败不影响导入结果——首次打开会按同一参数重试", async () => {
		installMock.mockRejectedValueOnce(new Error("npm down"));
		const created = await importDesignPackage("checkout.vetdz", withDeps, {
			confirmDependencyInstall: async () => true,
		});
		expect(created.vetdPath).toContain(".vetd");
	});

	it("未声明依赖的包不弹确认、不安装", async () => {
		designPackageJson = '{"private":true}';
		const noDeps = shareZip({
			"manifest.json": MANIFEST,
			"design/frames/home.tsx": "export default 1",
		});
		let asked = false;
		await importDesignPackage("plain.vetdz", noDeps, {
			confirmDependencyInstall: async () => {
				asked = true;
				return true;
			},
		});
		expect(asked).toBe(false);
		expect(installMock).not.toHaveBeenCalled();
	});
});

describe("恶意分享包在建项目之前就被拒绝", () => {
	it("解析失败时不创建项目、不落任何文件", async () => {
		const malicious = shareZip({ "manifest.json": MANIFEST, "design/../evil.txt": "evil" });
		await expect(importDesignPackage("evil.vetdz", malicious)).rejects.toThrow(/unsafe entry path/);
		expect(ctx.official.projects.create).not.toHaveBeenCalled();
		expect(fsCalls.writes.length).toBe(0);
	});
});
