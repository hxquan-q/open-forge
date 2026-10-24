import type * as ChildProcessModule from "node:child_process";
import { execFile, spawnSync } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	detectTarFlavor,
	installRuntimeArchive,
	installRuntimeDirectory,
	tarForceLocalArgs,
	tarPathArgument,
} from "./runtime-archive-installer";

vi.mock("node:child_process", async () => {
	const actual = await vi.importActual<typeof ChildProcessModule>("node:child_process");
	return { ...actual, spawnSync: vi.fn(actual.spawnSync), execFile: vi.fn(actual.execFile) };
});

const spawnSyncMock = vi.mocked(spawnSync);
const tarCalls = () =>
	[...spawnSyncMock.mock.calls, ...vi.mocked(execFile).mock.calls].filter(([command]) => command === "tar");

let testRoot = "";

beforeEach(async () => {
	testRoot = await mkdtemp(join(tmpdir(), "vetta-runtime-archive-"));
});

afterEach(async () => {
	await rm(testRoot, { recursive: true, force: true });
});

// GNU tar 会把 `C:\…` 盘符路径误判成远程 host:path，需要 `--force-local`；Windows 自带的
// bsdtar 不认识该选项，因此与实现侧共用同一组 helper 决定参数形态。
const tarLocalArgs = async () => tarForceLocalArgs(await detectTarFlavor());
const toTarPath = tarPathArgument;

// zip fixture 用 adm-zip 生成：不依赖 PATH 里的 tar 实现（GNU tar 压根产不出 zip），
// 也不会污染 spawnSync 调用记录。addLocalFolder 把 payloadDirectory 的“内容”放进
// topDirectory 前缀，zip 内顶层目录名与 innerDirectory 对齐。
function writeZipArchive(archivePath: string, payloadDirectory: string, topDirectory: string): void {
	const zip = new AdmZip();
	zip.addLocalFolder(payloadDirectory, topDirectory);
	zip.writeZip(archivePath);
}

describe("tar 参数按实现品类选择", () => {
	it("只有 GNU tar 加 --force-local", () => {
		expect(tarForceLocalArgs("gnu")).toEqual(["--force-local"]);
		expect(tarForceLocalArgs("bsd")).toEqual([]);
		expect(tarForceLocalArgs("unknown")).toEqual([]);
	});

	it("Windows 路径统一转正斜杠，POSIX 原样", () => {
		const windowsPath = String.raw`C:\Users\demo\runtime.tar.gz`;
		expect(tarPathArgument(windowsPath)).toBe(
			process.platform === "win32" ? "C:/Users/demo/runtime.tar.gz" : windowsPath,
		);
		const posixPath = "/opt/vetta/runtime.tar.gz";
		expect(tarPathArgument(posixPath)).toBe(posixPath);
	});

	it("探测到的实现与参数形态一致（本机真实 tar）", async () => {
		const flavor = await detectTarFlavor();
		expect(["gnu", "bsd", "unknown"]).toContain(flavor);
		expect(tarForceLocalArgs(flavor)).toEqual(flavor === "gnu" ? ["--force-local"] : []);
	});
});

describe("installRuntimeArchive", () => {
	it("extracts a complete runtime before replacing the target directory", async () => {
		const sourceRoot = join(testRoot, "source");
		const sourceRuntime = join(sourceRoot, "runtime", "bin");
		await mkdir(sourceRuntime, { recursive: true });
		await writeFile(join(sourceRuntime, "tool"), "new-runtime", "utf8");

		const archivePath = join(testRoot, "runtime.tar.gz");
		const archive = spawnSync(
			"tar",
			["-czf", toTarPath(archivePath), ...(await tarLocalArgs()), "-C", toTarPath(sourceRoot), "runtime"],
			{ encoding: "utf8" },
		);
		expect(archive.status, archive.stderr || archive.stdout).toBe(0);

		const targetDirectory = join(testRoot, "managed", "22.22.2");
		await mkdir(targetDirectory, { recursive: true });
		await writeFile(join(targetDirectory, "stale"), "stale", "utf8");

		await installRuntimeArchive({
			archivePath,
			archiveType: "tar.gz",
			innerDirectory: "runtime",
			targetDirectory,
		});

		await expect(readFile(join(targetDirectory, "bin", "tool"), "utf8")).resolves.toBe("new-runtime");
		await expect(readFile(join(targetDirectory, "stale"), "utf8")).rejects.toThrow();
		await expect(readdir(join(testRoot, "managed"))).resolves.toEqual(["22.22.2"]);

		// tar.gz 路径仍走外部 tar 解压（BUG-0023 兼容面不回退）。
		expect(tarCalls().some(([, args]) => Array.isArray(args) && args.includes("-xf"))).toBe(true);
	});

	it("extracts the Node ZIP format without invoking external tar", async () => {
		const sourceRoot = join(testRoot, "source");
		const sourceRuntime = join(sourceRoot, "node-v22.22.2-win-x64");
		await mkdir(sourceRuntime, { recursive: true });
		await writeFile(join(sourceRuntime, "node.exe"), "node-runtime", "utf8");

		const archivePath = join(testRoot, "node.zip");
		writeZipArchive(archivePath, sourceRuntime, "node-v22.22.2-win-x64");

		const targetDirectory = join(testRoot, "managed", "22.22.2");
		spawnSyncMock.mockClear();
		vi.mocked(execFile).mockClear();
		await installRuntimeArchive({
			archivePath,
			archiveType: "zip",
			innerDirectory: "node-v22.22.2-win-x64",
			targetDirectory,
		});

		await expect(readFile(join(targetDirectory, "node.exe"), "utf8")).resolves.toBe("node-runtime");
		// BUG-0046：PATH 先命中 GNU tar 时 zip 必失败，解压一律不得再 spawn 外部 tar。
		expect(tarCalls()).toEqual([]);
	});

	it("reports a corrupt ZIP as extract failed and keeps the existing runtime", async () => {
		const targetDirectory = join(testRoot, "managed", "22.22.2");
		await mkdir(targetDirectory, { recursive: true });
		await writeFile(join(targetDirectory, "node.exe"), "existing-runtime", "utf8");

		const archivePath = join(testRoot, "corrupt.zip");
		await writeFile(archivePath, "not a zip archive", "utf8");

		await expect(
			installRuntimeArchive({
				archivePath,
				archiveType: "zip",
				innerDirectory: "node-v22.22.2-win-x64",
				targetDirectory,
			}),
		).rejects.toThrow("zip extract failed");

		await expect(readFile(join(targetDirectory, "node.exe"), "utf8")).resolves.toBe("existing-runtime");
	});

	it("preserves an existing runtime when extraction fails", async () => {
		const targetDirectory = join(testRoot, "managed", "3.13.12");
		await mkdir(targetDirectory, { recursive: true });
		await writeFile(join(targetDirectory, "python.exe"), "existing-runtime", "utf8");
		const archivePath = join(testRoot, "broken.tar.gz");
		await writeFile(archivePath, "not an archive", "utf8");

		await expect(
			installRuntimeArchive({
				archivePath,
				archiveType: "tar.gz",
				innerDirectory: "python",
				targetDirectory,
			}),
		).rejects.toThrow("extract failed");

		await expect(readFile(join(targetDirectory, "python.exe"), "utf8")).resolves.toBe("existing-runtime");
		await expect(readdir(join(testRoot, "managed"))).resolves.toEqual(["3.13.12"]);
	});
});

describe("installRuntimeDirectory", () => {
	it("copies a bundled runtime directory over the target", async () => {
		const sourceDirectory = join(testRoot, "vendor", "python");
		await mkdir(join(sourceDirectory, "bin"), { recursive: true });
		await writeFile(join(sourceDirectory, "bin", "python3.13"), "bundled-runtime", "utf8");

		const targetDirectory = join(testRoot, "managed", "3.13.12");
		await mkdir(targetDirectory, { recursive: true });
		await writeFile(join(targetDirectory, "stale"), "stale", "utf8");

		await installRuntimeDirectory({ sourceDirectory, targetDirectory });

		await expect(readFile(join(targetDirectory, "bin", "python3.13"), "utf8")).resolves.toBe("bundled-runtime");
		await expect(readFile(join(targetDirectory, "stale"), "utf8")).rejects.toThrow();
		await expect(readdir(join(testRoot, "managed"))).resolves.toEqual(["3.13.12"]);
	});

	// python-build-standalone 与 Node 官方包都用符号链接（python3 -> python3.13），
	// 解引用会让运行时体积翻倍，可执行位丢失则 seed 出来的运行时直接不可用。
	it.runIf(process.platform !== "win32")("preserves symlinks and the executable bit", async () => {
		const sourceDirectory = join(testRoot, "vendor", "python");
		await mkdir(join(sourceDirectory, "bin"), { recursive: true });
		const realBinary = join(sourceDirectory, "bin", "python3.13");
		await writeFile(realBinary, "bundled-runtime", "utf8");
		await chmod(realBinary, 0o755);
		await symlink("python3.13", join(sourceDirectory, "bin", "python3"));

		const targetDirectory = join(testRoot, "managed", "3.13.12");
		await installRuntimeDirectory({ sourceDirectory, targetDirectory });

		const copiedLink = join(targetDirectory, "bin", "python3");
		await expect(lstat(copiedLink).then((info) => info.isSymbolicLink())).resolves.toBe(true);
		await expect(readlink(copiedLink)).resolves.toBe("python3.13");
		const mode = (await lstat(join(targetDirectory, "bin", "python3.13"))).mode & 0o777;
		expect(mode & 0o111).not.toBe(0);
	});

	it("preserves an existing runtime when the source is missing", async () => {
		const targetDirectory = join(testRoot, "managed", "3.13.12");
		await mkdir(targetDirectory, { recursive: true });
		await writeFile(join(targetDirectory, "python3"), "existing-runtime", "utf8");

		await expect(
			installRuntimeDirectory({ sourceDirectory: join(testRoot, "vendor", "absent"), targetDirectory }),
		).rejects.toThrow();

		await expect(readFile(join(targetDirectory, "python3"), "utf8")).resolves.toBe("existing-runtime");
	});
});
