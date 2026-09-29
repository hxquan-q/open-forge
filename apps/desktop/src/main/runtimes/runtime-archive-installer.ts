import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { extractZipArchiveSafely } from "../archive/safe-zip-extract.js";

export interface RuntimeArchiveInstallOptions {
	archivePath: string;
	archiveType: "tar.gz" | "zip";
	innerDirectory: string;
	targetDirectory: string;
}

export interface RuntimeDirectoryInstallOptions {
	sourceDirectory: string;
	targetDirectory: string;
}

export type TarFlavor = "gnu" | "bsd" | "unknown";

let cachedTarFlavor: TarFlavor | undefined;

/**
 * 按实际 tar 实现决定是否加 `--force-local`。
 *
 * GNU tar 会把 `C:/…` 盘符路径当成 `host:path` 远程语法，必须用该开关才当本地文件；
 * Windows 自带的 bsdtar（System32\tar.exe）**不认识**这个选项，直接报
 * `tar: Option --force-local is not supported` 并退出 1。探测结果缓存一次，
 * 只在进程内跑一次 `tar --version`。
 */
export function detectTarFlavor(): TarFlavor {
	if (cachedTarFlavor !== undefined) return cachedTarFlavor;
	const probe = spawnSync("tar", ["--version"], { encoding: "utf-8", timeout: 10_000 });
	const output = `${probe.stdout ?? ""}${probe.stderr ?? ""}`.toLowerCase();
	if (output.includes("gnu tar")) cachedTarFlavor = "gnu";
	else if (output.includes("bsdtar") || output.includes("libarchive")) cachedTarFlavor = "bsd";
	else cachedTarFlavor = "unknown";
	return cachedTarFlavor;
}

/** Windows 盘符与 `-C` chdir 都需要正斜杠；POSIX 原样传。 */
export function tarPathArgument(value: string): string {
	return process.platform === "win32" ? value.replaceAll("\\", "/") : value;
}

/** 只有 GNU tar 需要（且接受）`--force-local`；bsdtar 与未知实现都不加。 */
export function tarForceLocalArgs(flavor: TarFlavor): string[] {
	return flavor === "gnu" ? ["--force-local"] : [];
}

async function extractArchive(
	archivePath: string,
	destination: string,
	archiveType: RuntimeArchiveInstallOptions["archiveType"],
): Promise<void> {
	// zip 不经过外部 tar：Windows 上 PATH 里 GNU tar（Git Bash/MSYS2）常先于 bsdtar
	// 被命中，而 GNU tar 不支持 zip，Node runtime 的 zip 包会必失败（BUG-0046）。
	// 进程内解压沿用 safe-zip-extract 的路径穿越/大小上限防护。
	if (archiveType === "zip") {
		const buffer = await readFile(archivePath);
		try {
			await extractZipArchiveSafely(buffer, destination);
		} catch (error) {
			throw new Error(`zip extract failed: ${error instanceof Error ? error.message : String(error)}`);
		}
		return;
	}

	// Windows 10+ 的 bsdtar 与 Unix tar 都支持项目使用的 tar.gz。PATH 里也可能是
	// GNU tar（Git Bash/MSYS2 环境优先命中），它会把 `C:\…` 误判成 `host:path`
	// 远程语法、且 `-C` 的 chdir 不认反斜杠盘符；统一转成正斜杠路径，并只在确认
	// 为 GNU tar 时补 `--force-local`。
	const flavor = detectTarFlavor();
	const result = spawnSync(
		"tar",
		["-xf", tarPathArgument(archivePath), ...tarForceLocalArgs(flavor), "-C", tarPathArgument(destination)],
		{
			encoding: "utf-8",
			timeout: 180_000,
		},
	);
	if (result.status !== 0) {
		throw new Error(
			`${archiveType} extract failed: ${result.stderr || result.stdout || result.error?.message || "unknown error"}`,
		);
	}
}

/**
 * 先把运行时准备到同盘的 staging 目录，验证通过后再原子替换目标。
 * 准备过程失败不会破坏既有运行时。
 */
async function installViaStaging(
	targetDirectory: string,
	stagingPrefix: string,
	prepare: (stagingDirectory: string) => Promise<string>,
): Promise<void> {
	const targetParent = dirname(targetDirectory);
	await mkdir(targetParent, { recursive: true });
	const stagingDirectory = await mkdtemp(join(targetParent, `.${basename(targetDirectory)}-${stagingPrefix}-`));

	try {
		const preparedDirectory = await prepare(stagingDirectory);
		const preparedInfo = await stat(preparedDirectory).catch(() => undefined);
		if (!preparedInfo?.isDirectory()) {
			throw new Error(`runtime payload is missing directory: ${preparedDirectory}`);
		}

		await rm(targetDirectory, { recursive: true, force: true });
		await rename(preparedDirectory, targetDirectory);
	} finally {
		if (existsSync(stagingDirectory)) {
			await rm(stagingDirectory, { recursive: true, force: true });
		}
	}
}

export async function installRuntimeArchive(options: RuntimeArchiveInstallOptions): Promise<void> {
	await installViaStaging(options.targetDirectory, "extract", async (stagingDirectory) => {
		await extractArchive(options.archivePath, stagingDirectory, options.archiveType);
		return join(stagingDirectory, options.innerDirectory);
	});
}

/**
 * 从已解压的内置目录安装（macOS 专用形态）。macOS 的 vendor 运行时必须以解压
 * 目录内置，归档里的 Mach-O 签不到名、过不了公证，详见 docs/desktop/macos-auto-update.md。
 * 复制保留符号链接与权限位，因此二进制上的代码签名不受影响。
 */
export async function installRuntimeDirectory(options: RuntimeDirectoryInstallOptions): Promise<void> {
	await installViaStaging(options.targetDirectory, "copy", async (stagingDirectory) => {
		const preparedDirectory = join(stagingDirectory, "payload");
		// verbatimSymlinks 不可省：默认会把相对链接（python3 -> python3.13）重写成
		// 指向源目录的绝对路径，安装后就指回了 app bundle 内部，更新替换 .app 时悬空。
		await cp(options.sourceDirectory, preparedDirectory, {
			recursive: true,
			preserveTimestamps: true,
			verbatimSymlinks: true,
		});
		return preparedDirectory;
	});
}
