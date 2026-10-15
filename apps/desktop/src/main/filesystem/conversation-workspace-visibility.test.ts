// Modified by The Open Forge contributors.
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** Set the path environment before module evaluation, without charging cold transforms to a hook. */
const fixture = await vi.hoisted(async () => {
	const { mkdtemp } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const home = await mkdtemp(join(tmpdir(), "vetta-conv-visibility-"));
	const previousVettaHome = process.env.VETTA_HOME;
	process.env.VETTA_HOME = home;
	return { home, previousVettaHome };
});

import { DEFAULT_CONVERSATION_CWD } from "../config/desktop-config-store.js";
import * as service from "./filesystem-service.js";

describe("「对话」根目录下会话工作区的列举可见性", () => {
	const uuidDirName = "0c558d85-6603-4e52-81a4-ba686d57a3e4";
	const conversationRoot = DEFAULT_CONVERSATION_CWD;

	beforeAll(async () => {
		await mkdir(join(conversationRoot, uuidDirName), { recursive: true });
		await writeFile(join(conversationRoot, uuidDirName, "inner.md"), "inner", "utf8");
		await mkdir(join(conversationRoot, "legacy-assets"), { recursive: true });
		await writeFile(join(conversationRoot, "legacy-assets", "chart.html"), "<html/>", "utf8");
		await writeFile(join(conversationRoot, "report.md"), "legacy", "utf8");
		service.allowProjectRoot(conversationRoot);
	});

	afterAll(async () => {
		if (fixture.previousVettaHome === undefined) {
			delete process.env.VETTA_HOME;
		} else {
			process.env.VETTA_HOME = fixture.previousVettaHome;
		}
		vi.resetModules();
		expect(fixture.home.startsWith(join(tmpdir(), "vetta-conv-visibility-"))).toBe(true);
		await rm(fixture.home, { recursive: true, force: true });
	});

	it("列举「对话」根时隐藏 uuid 工作区目录，老产物保持可见", async () => {
		const names = (await service.readFilesystemDirectory(conversationRoot)).map((entry) => entry.name);
		expect(names).toEqual(["legacy-assets", "report.md"]);
	});

	it("递归列举（@文件补全）不进入 uuid 工作区目录", async () => {
		const relPaths = (await service.listFilesystemFilesRecursive(conversationRoot)).map((file) => file.relPath);
		expect(relPaths).toContain(join("legacy-assets", "chart.html"));
		expect(relPaths).toContain("report.md");
		expect(relPaths.some((relPath) => relPath.startsWith(uuidDirName))).toBe(false);
	});

	it("会话自己的工作区目录作为根时不受过滤影响", async () => {
		const names = (await service.readFilesystemDirectory(join(conversationRoot, uuidDirName))).map(
			(entry) => entry.name,
		);
		expect(names).toEqual(["inner.md"]);
	});
});
