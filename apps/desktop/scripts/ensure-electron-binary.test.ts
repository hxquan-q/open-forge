// Copyright The Open Forge contributors.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	ensureElectronBinary,
	inspectElectronInstall,
	resolveElectronPackageDir,
	resolvePlatformExecutable,
} from "./ensure-electron-binary.mjs";

const PACKAGE_VERSION = "39.8.10";
const silentLog = () => undefined;

function writeElectronInstall(
	packageDir: string,
	{
		packageVersion = PACKAGE_VERSION,
		distVersion = PACKAGE_VERSION,
		executable = "electron.exe",
	}: { packageVersion?: string; distVersion?: string; executable?: string } = {},
) {
	mkdirSync(join(packageDir, "dist"), { recursive: true });
	writeFileSync(join(packageDir, "package.json"), JSON.stringify({ name: "electron", version: packageVersion }));
	writeFileSync(join(packageDir, "path.txt"), executable);
	writeFileSync(join(packageDir, "dist", "version"), distVersion);
	writeFileSync(join(packageDir, "dist", executable), "binary");
}

describe("Desktop dev Electron binary guard", () => {
	let root: string;
	let packageDir: string;
	const winEnv: NodeJS.ProcessEnv = { npm_config_platform: "win32" };

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "vetta-electron-"));
		packageDir = join(root, "node_modules", "electron");
		mkdirSync(packageDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it("resolves the package directory from the resolved electron entry", () => {
		const resolve = () => join(root, "node_modules", "electron", "index.js");

		expect(resolveElectronPackageDir(resolve)).toBe(packageDir);
	});

	it("maps platforms the way the package installer does", () => {
		expect(resolvePlatformExecutable("win32")).toBe("electron.exe");
		expect(resolvePlatformExecutable("linux")).toBe("electron");
		expect(resolvePlatformExecutable("darwin")).toBe("Electron.app/Contents/MacOS/Electron");
		expect(resolvePlatformExecutable("aix")).toBeUndefined();
	});

	it("accepts an install whose path.txt, executable and dist/version all agree", () => {
		writeElectronInstall(packageDir);

		expect(inspectElectronInstall(packageDir, { platform: "win32" })).toEqual({
			complete: true,
			reason: "installed",
			executablePath: join(packageDir, "dist", "electron.exe"),
		});
	});

	it("detects the missing path.txt an interrupted postinstall leaves behind", () => {
		writeElectronInstall(packageDir);
		rmSync(join(packageDir, "path.txt"));

		expect(inspectElectronInstall(packageDir, { platform: "win32" })).toMatchObject({
			complete: false,
			reason: "missing-path-file",
		});
	});

	it("detects a truncated dist even when path.txt was written", () => {
		writeElectronInstall(packageDir);
		rmSync(join(packageDir, "dist", "electron.exe"));

		expect(inspectElectronInstall(packageDir, { platform: "win32" })).toMatchObject({
			complete: false,
			reason: "missing-executable",
		});
	});

	it("detects a dist left over from another electron version", () => {
		writeElectronInstall(packageDir, { packageVersion: "40.0.0" });

		expect(inspectElectronInstall(packageDir, { platform: "win32" })).toMatchObject({
			complete: false,
			reason: "version-mismatch",
		});
	});

	it("keeps dev startup untouched when the binary is already installed", async () => {
		writeElectronInstall(packageDir);
		const runInstaller = vi.fn();

		const result = await ensureElectronBinary({ packageDir, env: winEnv, runInstaller, log: silentLog });

		expect(result).toMatchObject({ status: "installed" });
		expect(runInstaller).not.toHaveBeenCalled();
	});

	it("repairs an incomplete install with the package's own installer", async () => {
		writeElectronInstall(packageDir);
		rmSync(join(packageDir, "path.txt"));
		const runInstaller = vi.fn(async () => {
			writeElectronInstall(packageDir);
		});
		const logs: string[] = [];

		const result = await ensureElectronBinary({
			packageDir,
			env: winEnv,
			runInstaller,
			log: (message: string) => logs.push(message),
		});

		expect(runInstaller).toHaveBeenCalledWith(packageDir, winEnv);
		expect(result).toMatchObject({
			status: "repaired",
			executablePath: join(packageDir, "dist", "electron.exe"),
		});
		expect(logs.join("\n")).toContain("正在用包内 install.js 修复");
	});

	it("fails with an actionable message when the installer still produces nothing", async () => {
		const runInstaller = vi.fn(async () => undefined);

		await expect(
			ensureElectronBinary({ packageDir, env: winEnv, runInstaller, log: silentLog }),
		).rejects.toThrow(/bun install\.js[\s\S]*ELECTRON_OVERRIDE_DIST_PATH/);
		expect(runInstaller).toHaveBeenCalledTimes(1);
	});

	it("does not touch the package when the user points Electron at their own dist", async () => {
		const runInstaller = vi.fn();

		const result = await ensureElectronBinary({
			packageDir,
			env: { ...winEnv, ELECTRON_OVERRIDE_DIST_PATH: "C:\\electron-dist" },
			runInstaller,
			log: silentLog,
		});

		expect(result).toMatchObject({ status: "override" });
		expect(runInstaller).not.toHaveBeenCalled();
	});

	it("explains that ELECTRON_SKIP_BINARY_DOWNLOAD is why nothing can be repaired", async () => {
		const runInstaller = vi.fn();

		await expect(
			ensureElectronBinary({
				packageDir,
				env: { ...winEnv, ELECTRON_SKIP_BINARY_DOWNLOAD: "1" },
				runInstaller,
				log: silentLog,
			}),
		).rejects.toThrow(/ELECTRON_SKIP_BINARY_DOWNLOAD/);
		expect(runInstaller).not.toHaveBeenCalled();
	});

	it("skips the check on platforms the installer itself cannot map", async () => {
		const runInstaller = vi.fn();

		const result = await ensureElectronBinary({
			packageDir,
			env: { npm_config_platform: "aix" },
			runInstaller,
			log: silentLog,
		});

		expect(result).toMatchObject({ status: "unsupported-platform" });
		expect(runInstaller).not.toHaveBeenCalled();
	});
});
