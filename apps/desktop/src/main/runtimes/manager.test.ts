// Copyright The Open Forge contributors.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RuntimeManager } from "./manager.js";
import { platformEntry, RUNTIME_MANIFEST } from "./paths.js";
import { detectTarFlavor, tarForceLocalArgs, tarPathArgument } from "./runtime-archive-installer.js";

vi.mock("../logger.js", () => ({
	getAppLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

let testRoot = "";
let savedAgentDir: string | undefined;
let savedPath: string | undefined;

beforeEach(async () => {
	testRoot = await mkdtemp(join(tmpdir(), "vetta-runtime-mgr-"));
	savedAgentDir = process.env.VETTA_CODING_AGENT_DIR;
	savedPath = process.env.PATH;
	process.env.VETTA_CODING_AGENT_DIR = join(testRoot, "agent");
});

afterEach(async () => {
	if (savedAgentDir === undefined) delete process.env.VETTA_CODING_AGENT_DIR;
	else process.env.VETTA_CODING_AGENT_DIR = savedAgentDir;
	if (savedPath === undefined) delete process.env.PATH;
	else process.env.PATH = savedPath;
	await rm(testRoot, { recursive: true, force: true });
});

/**
 * 造一个含可执行文件骨架的假归档，格式按 manifest 的 `entry.archive` 决定：
 * zip 用 adm-zip 生成（GNU tar 产不出 zip，且 zip 解压已不走外部 tar），
 * tar.gz 沿用系统 tar。
 */
async function fakeArchive(type: "node" | "python"): Promise<Buffer> {
	const entry = platformEntry(type);
	if (!entry) throw new Error("test platform unsupported");
	const exe =
		process.platform === "win32"
			? type === "python"
				? "python.exe"
				: "node.exe"
			: type === "python"
				? "bin/python3"
				: "bin/node";
	const staging = join(testRoot, `pkg-${type}`);
	await mkdir(join(staging, entry.dir), { recursive: true });
	await writeFile(join(staging, entry.dir, exe), "fake-runtime");
	if (entry.archive === "zip") {
		const out = join(testRoot, `${type}.zip`);
		const zip = new AdmZip();
		zip.addLocalFolder(staging);
		zip.writeZip(out);
		return readFile(out);
	}
	const out = join(testRoot, `${type}.tar.gz`);
	const result = spawnSync(
		"tar",
		[
			"-czf",
			tarPathArgument(out),
			...tarForceLocalArgs(await detectTarFlavor()),
			"-C",
			tarPathArgument(staging),
			entry.dir,
		],
		{ timeout: 30_000 },
	);
	if (result.status !== 0) throw new Error(`tar failed: ${result.stderr}`);
	return readFile(out);
}

const itWindowsOnly = process.platform === "win32" ? it : it.skip;

describe("RuntimeManager 自动下载", () => {
	itWindowsOnly(
		"vendor 缺位时 initialize 后台下载并就绪",
		async () => {
			const archives = { node: await fakeArchive("node"), python: await fakeArchive("python") };
			const manager = new RuntimeManager({
				fetchImpl: async (url) => {
					const type = String(url).includes("cpython") ? "python" : "node";
					return new Response(new Uint8Array(archives[type]));
				},
			});

			await manager.initialize();
			await vi.waitFor(async () => expect((await manager.getStatus()).node.ready).toBe(true), { timeout: 15_000 });
			await vi.waitFor(async () => expect((await manager.getStatus()).python.ready).toBe(true), { timeout: 15_000 });
			// ready 先落位、收尾(记 registry/shim)后才清 downloading 标记
			await vi.waitFor(async () => expect((await manager.getStatus()).node.downloading).toBe(false), {
				timeout: 15_000,
			});
		},
		30_000,
	);

	itWindowsOnly(
		"reinstall 与进行中的后台下载去重",
		async () => {
			const archive = await fakeArchive("node");
			let calls = 0;
			const manager = new RuntimeManager({
				fetchImpl: async (url) => {
					calls += 1;
					if (String(url).includes("cpython")) throw new Error("not under test");
					await new Promise((resolve) => setTimeout(resolve, 30));
					return new Response(new Uint8Array(archive));
				},
			});

			await manager.initialize();
			const [a, b] = await Promise.all([manager.reinstall("node"), manager.reinstall("node")]);

			expect(a.ready).toBe(true);
			expect(b.ready).toBe(true);
			// 自动下载 + 两次 reinstall 共享同一任务：node 的 fetch 至多命中 manifest 源数
			expect(calls).toBeLessThanOrEqual(RUNTIME_MANIFEST.node.sources.length);
			expect(existsSync(join(testRoot, "runtimes", "node", RUNTIME_MANIFEST.node.version, "node.exe"))).toBe(true);
		},
		30_000,
	);

	itWindowsOnly(
		"全部源失败时状态落回未就绪且可重试",
		async () => {
			const manager = new RuntimeManager({
				fetchImpl: async () => {
					throw new Error("offline");
				},
			});

			await manager.initialize();
			await vi.waitFor(async () => expect((await manager.getStatus()).node.downloading).toBe(false), {
				timeout: 15_000,
			});
			expect((await manager.getStatus()).node.ready).toBe(false);
		},
		30_000,
	);
});
