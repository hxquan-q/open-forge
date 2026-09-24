// Copyright The Open Forge contributors.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureVettaLocalGitignore, loadProjectConventions } from "../../src/projects/load-project-conventions.js";
import {
	conventionsFromManifest,
	gitignoreAdditionForVettaLocal,
	legacyProjectConventions,
	readVettaProjectManifest,
	VettaProjectManifestError,
} from "../../src/projects/shared-project-conventions.js";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function tempRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "vetta-project-"));
	roots.push(root);
	return root;
}

describe("readVettaProjectManifest", () => {
	it("v1 清单收窄通过；子目录缺省启用", () => {
		const manifest = readVettaProjectManifest({ schemaVersion: 1 });
		expect(manifest.schemaVersion).toBe(1);
		const conventions = conventionsFromManifest("/p", manifest);
		expect(conventions.agentsEnabled).toBe(true);
		expect(conventions.policiesEnabled).toBe(true);
	});

	it("子目录可显式关闭", () => {
		const conventions = conventionsFromManifest("/p", readVettaProjectManifest({ schemaVersion: 1, skills: false }));
		expect(conventions.skillsEnabled).toBe(false);
		expect(conventions.agentsEnabled).toBe(true);
	});

	it("未知更高版本 fail closed，错误含恢复路径", () => {
		expect(() => readVettaProjectManifest({ schemaVersion: 99 })).toThrow(VettaProjectManifestError);
		try {
			readVettaProjectManifest({ schemaVersion: 99 });
		} catch (error) {
			expect((error as VettaProjectManifestError).code).toBe("unknown-schema-version");
			expect((error as VettaProjectManifestError).message).toContain("upgrade the app");
		}
	});

	it("缺 schemaVersion、未知字段、非对象一律 invalid-manifest", () => {
		expect(() => readVettaProjectManifest({})).toThrow(VettaProjectManifestError);
		expect(() => readVettaProjectManifest("nope")).toThrow(VettaProjectManifestError);
		expect(() => readVettaProjectManifest({ schemaVersion: 1, extra: true })).toThrow(VettaProjectManifestError);
	});
});

describe("loadProjectConventions", () => {
	it("无 .vetta 目录时回落 v0 兼容默认", async () => {
		const root = await tempRoot();
		const conventions = await loadProjectConventions(root);
		expect(conventions.schemaVersion).toBe(0);
		expect(conventions.skillsEnabled).toBe(true);
		expect(legacyProjectConventions(root).schemaVersion).toBe(0);
	});

	it("读取 v1 清单并应用子目录开关", async () => {
		const root = await tempRoot();
		const { mkdir } = await import("node:fs/promises");
		await mkdir(join(root, ".vetta"), { recursive: true });
		await writeFile(
			join(root, ".vetta", "project.json"),
			JSON.stringify({ schemaVersion: 1, agents: false }),
			"utf8",
		);
		const conventions = await loadProjectConventions(root);
		expect(conventions.schemaVersion).toBe(1);
		expect(conventions.agentsEnabled).toBe(false);
		expect(conventions.taskTemplatesEnabled).toBe(true);
	});

	it("损坏 JSON 与未知版本都抛 fail-closed 错误", async () => {
		const root = await tempRoot();
		const { mkdir } = await import("node:fs/promises");
		await mkdir(join(root, ".vetta"), { recursive: true });
		await writeFile(join(root, ".vetta", "project.json"), "{ broken", "utf8");
		await expect(loadProjectConventions(root)).rejects.toThrow(VettaProjectManifestError);
		await writeFile(join(root, ".vetta", "project.json"), JSON.stringify({ schemaVersion: 42 }), "utf8");
		await expect(loadProjectConventions(root)).rejects.toThrow(/newer than supported/);
	});
});

describe("ensureVettaLocalGitignore", () => {
	it("无忽略规则时追加标记段；已有规则（含手写）不改动", async () => {
		const root = await tempRoot();
		const first = await ensureVettaLocalGitignore(root);
		expect(first.added).toBe(true);
		expect(await readFile(first.gitignorePath, "utf8")).toContain(".vetta-local/");

		const second = await ensureVettaLocalGitignore(root);
		expect(second.added).toBe(false);

		const manual = await tempRoot();
		await writeFile(join(manual, ".gitignore"), ".vetta-local\n", "utf8");
		expect((await ensureVettaLocalGitignore(manual)).added).toBe(false);
		expect(await readFile(join(manual, ".gitignore"), "utf8")).toBe(".vetta-local\n");
	});

	it("既有 .gitignore 保留原内容并正确换行", async () => {
		const root = await tempRoot();
		await writeFile(join(root, ".gitignore"), "node_modules", "utf8");
		const result = await ensureVettaLocalGitignore(root);
		expect(result.added).toBe(true);
		const contents = await readFile(result.gitignorePath, "utf8");
		expect(contents.startsWith("node_modules\n")).toBe(true);
		expect(contents).toContain(".vetta-local/");
		expect(gitignoreAdditionForVettaLocal(contents)).toBe("");
	});
});
