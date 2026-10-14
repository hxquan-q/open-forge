// Copyright The Open Forge contributors.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * `dev:electron` 启动前的 Electron 二进制校验与自愈（BUG-0102）。
 *
 * electron 的 npm 包本身不带二进制：`postinstall` 的 `install.js` 下载 zip、解压到包内
 * `dist/`，最后写 `path.txt`。这一步可能只完成一部分（`dist/` 残缺、没有 `path.txt`），
 * 此后 `require("electron")` 会在 `index.js` 抛
 * 「Electron failed to install correctly」——`run-dev-electron.mjs` 的顶层 import 就崩在
 * 这里，报错文本还建议删除整个 `node_modules`。`bun install` 不会重跑已存在依赖的
 * postinstall，`ensure-workspace-install.mjs` 的指纹也只看清单变化，所以清单没变时它
 * 永远修不回来。这里在 spawn Electron 之前复验包内状态，缺失时复用官方 `install.js`
 * 补齐（通常命中 `@electron/get` 缓存），失败时给出可操作的指引。
 */

const PLATFORM_EXECUTABLES = {
	darwin: "Electron.app/Contents/MacOS/Electron",
	mas: "Electron.app/Contents/MacOS/Electron",
	freebsd: "electron",
	openbsd: "electron",
	linux: "electron",
	win32: "electron.exe",
};

const REASON_MESSAGES = {
	"missing-path-file": "包内 path.txt 缺失（postinstall 未完成）",
	"missing-executable": "path.txt 指向的可执行文件不存在（dist 解压不完整）",
	"version-mismatch": "dist/version 与 electron 包版本不一致",
	"unsupported-platform": "当前平台不在 Electron 平台映射内",
};

export function resolvePlatformExecutable(platform) {
	return PLATFORM_EXECUTABLES[platform];
}

/** 从脚本自身解析 electron 包目录（`resolve("electron")` 给出包内 `index.js`）。 */
export function resolveElectronPackageDir(requireResolve = createRequire(import.meta.url).resolve) {
	return dirname(requireResolve("electron"));
}

function readTrimmed(path) {
	try {
		return readFileSync(path, "utf8").trim();
	} catch {
		return undefined;
	}
}

function readPackageVersion(packageDir) {
	const raw = readTrimmed(join(packageDir, "package.json"));
	if (raw === undefined) return undefined;
	try {
		const parsed = JSON.parse(raw);
		return typeof parsed?.version === "string" ? parsed.version : undefined;
	} catch {
		return undefined;
	}
}

/**
 * 包内安装状态。与 `install.js#isInstalled` 判据一致：`path.txt` 必须指向存在的可执行
 * 文件，`dist/version` 必须等于包版本。`reason` 只用于日志与错误文本。
 */
export function inspectElectronInstall(packageDir, { platform = process.platform } = {}) {
	const executable = resolvePlatformExecutable(platform);
	if (!executable) return { complete: false, reason: "unsupported-platform", executablePath: undefined };

	const recorded = readTrimmed(join(packageDir, "path.txt"));
	if (!recorded) return { complete: false, reason: "missing-path-file", executablePath: undefined };

	const executablePath = join(packageDir, "dist", recorded);
	if (!existsSync(executablePath)) {
		return { complete: false, reason: "missing-executable", executablePath };
	}

	const packageVersion = readPackageVersion(packageDir)?.replace(/^v/, "");
	const distVersion = readTrimmed(join(packageDir, "dist", "version"))?.replace(/^v/, "");
	if (packageVersion !== undefined && distVersion !== undefined && packageVersion !== distVersion) {
		return { complete: false, reason: "version-mismatch", executablePath };
	}

	return { complete: true, reason: "installed", executablePath };
}

/** 用仓库的 Bun 执行包内官方安装脚本；Bun 比 Node 在本机更稳定地完成解压（见 BUG-0102）。 */
export function runElectronInstaller(packageDir, env = process.env) {
	return new Promise((resolve, reject) => {
		const child = spawn("bun", ["install.js"], { cwd: packageDir, stdio: "inherit", shell: false, env });
		child.once("error", reject);
		child.once("exit", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`electron install.js 退出码 ${code}（cwd ${packageDir}）`));
		});
	});
}

export async function ensureElectronBinary({
	packageDir = resolveElectronPackageDir(),
	env = process.env,
	runInstaller = runElectronInstaller,
	log = console.log,
} = {}) {
	const platform = env.npm_config_platform || process.platform;
	if (!resolvePlatformExecutable(platform)) {
		log(`[ensure-electron-binary] 平台 ${platform} 不在已知映射内，跳过校验`);
		return { status: "unsupported-platform" };
	}

	// 用户显式接管 dist 时 index.js 不读 path.txt，这里不覆盖用户选择。
	if ((env.ELECTRON_OVERRIDE_DIST_PATH ?? "").trim() !== "") {
		log("[ensure-electron-binary] ELECTRON_OVERRIDE_DIST_PATH 已设置，按用户接管跳过校验");
		return { status: "override" };
	}

	const before = inspectElectronInstall(packageDir, { platform });
	if (before.complete) return { status: "installed", executablePath: before.executablePath };

	if ((env.ELECTRON_SKIP_BINARY_DOWNLOAD ?? "").trim() !== "") {
		throw new Error(
			`Electron 二进制不可用：${REASON_MESSAGES[before.reason]}，且 ELECTRON_SKIP_BINARY_DOWNLOAD 已设置。取消该变量后重试。`,
		);
	}

	log(
		`[ensure-electron-binary] Electron 二进制不完整（${REASON_MESSAGES[before.reason]}），正在用包内 install.js 修复：${packageDir}`,
	);
	await runInstaller(packageDir, env);

	const after = inspectElectronInstall(packageDir, { platform });
	if (!after.complete) {
		throw new Error(
			`Electron 二进制自动修复后仍不可用：${REASON_MESSAGES[after.reason]}。` +
				`请手工执行 \`bun install.js\`（cwd ${packageDir}）后重试，或用 ELECTRON_MIRROR 指定下载源、` +
				"ELECTRON_OVERRIDE_DIST_PATH 指向现成的同版本 dist。",
		);
	}

	log(`[ensure-electron-binary] 修复完成：${after.executablePath}`);
	return { status: "repaired", executablePath: after.executablePath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		await ensureElectronBinary();
	} catch (error) {
		console.error(`[ensure-electron-binary] ${error instanceof Error ? error.message : error}`);
		process.exitCode = 1;
	}
}
