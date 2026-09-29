// Copyright The Open Forge contributors.
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { checkLocalSources, compareLocalSourceState, isResearchSourceFile, scanLocalSources } from "../src/index.js";

const dirs: string[] = [];
function tempRoot(): string {
	const dir = mkdtempSync(join(tmpdir(), "local-source-"));
	dirs.push(dir);
	return dir;
}
afterEach(() => {
	while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function write(root: string, rel: string, content = "x"): string {
	const full = join(root, ...rel.split("/"));
	mkdirSync(join(full, ".."), { recursive: true });
	writeFileSync(full, content);
	return full;
}

describe("isResearchSourceFile", () => {
	it("扩展名白名单 + 排除锁文件", () => {
		expect(isResearchSourceFile("notes.md")).toBe(true);
		expect(isResearchSourceFile("report.PDF")).toBe(true);
		expect(isResearchSourceFile("data.xlsx")).toBe(true);
		expect(isResearchSourceFile("script.ts")).toBe(false);
		expect(isResearchSourceFile("package-lock.json")).toBe(false);
		expect(isResearchSourceFile("noext")).toBe(false);
	});
});

describe("scanLocalSources", () => {
	it("枚举支持类型、跳过隐藏/排除目录、按相对路径排序", async () => {
		const root = tempRoot();
		write(root, "b.md");
		write(root, "sub/a.pdf");
		write(root, "sub/code.ts"); // 不在白名单
		write(root, ".hidden/x.md");
		write(root, "node_modules/dep/readme.md");
		write(root, ".git/config.md");
		const result = await scanLocalSources(root);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.sources.map((s) => s.relativePath)).toEqual(["b.md", "sub/a.pdf"]);
		expect(result.sources[0]!.uri).toBe(pathToFileURL(join(root, "b.md")).href);
		expect(result.sources[0]!.sizeBytes).toBe(1);
		expect(result.truncated).toBe(false);
		expect(result.failures).toEqual([]);
	});

	it("根目录不存在/非目录 → 显式失败而非空集", async () => {
		expect(await scanLocalSources(join(tempRoot(), "nope"))).toEqual({ ok: false, reason: "missing" });
		const file = write(tempRoot(), "f.md");
		expect(await scanLocalSources(file)).toEqual({ ok: false, reason: "not-a-directory" });
	});

	it("深度上限之外的文件不进检索范围", async () => {
		const root = tempRoot();
		write(root, "d1/d2/d3/d4/d5/d6/d7/deep.md");
		write(root, "d1/shallow.md");
		const result = await scanLocalSources(root);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.sources.map((s) => s.relativePath)).toEqual(["d1/shallow.md"]);
	});
});

describe("checkLocalSources", () => {
	it("ok / changed(尺寸) / changed(mtime) / missing 四种状态", async () => {
		const root = tempRoot();
		const keep = write(root, "keep.md", "same");
		const grown = write(root, "grown.md", "a");
		const touched = write(root, "touched.md", "same");
		const keepStat = { sizeBytes: 4, modifiedAtMs: (await import("node:fs")).statSync(keep).mtimeMs };
		// grown 录制时尺寸为 1，现在仍是 1 → 先录制再改尺寸
		writeFileSync(grown, "longer-content");
		const touchedDate = new Date(Date.now() + 60_000);
		utimesSync(touched, touchedDate, touchedDate);
		const checks = await checkLocalSources([
			{ path: keep, ...keepStat },
			{ path: grown, sizeBytes: 1, modifiedAtMs: keepStat.modifiedAtMs },
			{ path: touched, sizeBytes: 4, modifiedAtMs: keepStat.modifiedAtMs },
			{ path: join(root, "gone.md"), sizeBytes: 1, modifiedAtMs: 0 },
		]);
		expect(checks.map((c) => c.status)).toEqual(["ok", "changed", "changed", "missing"]);
	});
});

describe("compareLocalSourceState", () => {
	it("mtime 1ms 容差内仍判 ok", () => {
		const rec = { path: "x", sizeBytes: 10, modifiedAtMs: 1000 };
		expect(compareLocalSourceState(rec, { sizeBytes: 10, modifiedAtMs: 1000.5 })).toBe("ok");
		expect(compareLocalSourceState(rec, { sizeBytes: 10, modifiedAtMs: 1002 })).toBe("changed");
		expect(compareLocalSourceState(rec, undefined)).toBe("missing");
	});
});
