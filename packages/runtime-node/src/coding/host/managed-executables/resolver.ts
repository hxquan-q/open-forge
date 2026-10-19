// Modified by The Open Forge contributors.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { arch, platform } from "node:os";
import { join } from "node:path";
import type { CodingToolExecutable, CodingToolExecutableResolver, CodingToolInspection } from "@vetta/runtime-tools";
import { defaultCodingToolArchiveOperations, installCodingToolArchive } from "./archive-installer.js";
import { createCodingToolDownloadPlan, getCodingToolReleaseConfig } from "./catalog.js";
import { downloadCodingToolArchiveWithRetry, fetchLatestCodingToolVersion } from "./network.js";

const TERMUX_PACKAGES: Record<CodingToolExecutable, string> = { fd: "fd", rg: "ripgrep" };

export type ResolveCodingToolExecutable = (tool: CodingToolExecutable, silent?: boolean) => Promise<string | undefined>;

export interface ManagedCodingToolExecutableDependencies {
	readonly getPath: (tool: CodingToolExecutable) => string | null;
	readonly isOffline: () => boolean;
	readonly platform: () => string;
	readonly download: (tool: CodingToolExecutable) => Promise<string>;
	/** 下载失败时的旁路记录（同实例 `inspect()` 的 `lastError`/`download-failed` 来源）。 */
	readonly recordFailure?: (tool: CodingToolExecutable, message: string) => void;
}

export interface ManagedCodingToolExecutableResolverOptions {
	readonly toolsDirectory: string;
	readonly resolveExecutable?: ResolveCodingToolExecutable;
	readonly report?: (message: string) => void;
	/** `inspect()` 的依赖注入；缺省用 toolsDirectory 的真实文件系统探针。 */
	readonly inspectionDependencies?: ManagedCodingToolInspectionDependencies;
}

/** PATH 探针结果：命令存在性与 `--version` 输出里解析出的版本。 */
export interface CodingToolCommandProbe {
	readonly exists: boolean;
	readonly version?: string;
}

/** `inspect()` 的依赖注入合同，与 `ManagedCodingToolExecutableDependencies` 同风格。 */
export interface ManagedCodingToolInspectionDependencies {
	readonly getCachedPath: (tool: CodingToolExecutable) => string | null;
	readonly readVersionMarker: (tool: CodingToolExecutable) => string | null;
	readonly probeCommand: (command: string) => CodingToolCommandProbe;
	readonly isOffline: () => boolean;
}

export function createManagedCodingToolExecutableResolver(
	options: ManagedCodingToolExecutableResolverOptions,
): CodingToolExecutableResolver {
	const downloadFailures = new Map<CodingToolExecutable, string>();
	const resolveExecutable =
		options.resolveExecutable ??
		((tool, silent) =>
			ensureManagedCodingToolExecutable(tool, {
				...options,
				silent,
				recordFailure: (failedTool, message) => downloadFailures.set(failedTool, message),
			}));
	const inspectionDependencies =
		options.inspectionDependencies ?? createDefaultInspectionDependencies(options.toolsDirectory);
	return {
		resolve: (tool) => resolveExecutable(tool, true),
		inspect: async (tool) =>
			applyDownloadFailureRecord(
				inspectManagedCodingToolExecutable(tool, inspectionDependencies),
				downloadFailures.get(tool),
			),
	};
}

/** 把同实例历史下载失败并入解析记录：仍缺失时升格来源，已能解析时只附失败史。 */
export function applyDownloadFailureRecord(
	inspection: CodingToolInspection,
	lastError: string | undefined,
): CodingToolInspection {
	if (lastError === undefined) return inspection;
	return inspection.source === "missing"
		? { ...inspection, source: "download-failed", lastError }
		: { ...inspection, lastError };
}

export async function resolveManagedCodingToolExecutable(
	tool: CodingToolExecutable,
	silent: boolean,
	dependencies: ManagedCodingToolExecutableDependencies,
	report: (message: string) => void = console.log,
): Promise<string | undefined> {
	const existingPath = dependencies.getPath(tool);
	if (existingPath) return existingPath;
	const config = getCodingToolReleaseConfig(tool);
	if (dependencies.isOffline()) {
		if (!silent) report(`${config.name} not found. Offline mode enabled, skipping download.`);
		return undefined;
	}
	if (dependencies.platform() === "android") {
		if (!silent) report(`${config.name} not found. Install with: pkg install ${TERMUX_PACKAGES[tool]}`);
		return undefined;
	}
	if (!silent) report(`${config.name} not found. Downloading...`);
	try {
		const path = await dependencies.download(tool);
		if (!silent) report(`${config.name} installed to ${path}`);
		return path;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		dependencies.recordFailure?.(tool, message);
		if (!silent) report(`Failed to download ${config.name}: ${message}`);
		return undefined;
	}
}

/**
 * 只读解析记录：缓存命中读 `.version` 标记（存量无标记回退一次 `--version` 探针），
 * 否则探 PATH，均无报告 missing 与离线标志。不下载、不联网、不写任何状态。
 */
export function inspectManagedCodingToolExecutable(
	tool: CodingToolExecutable,
	dependencies: ManagedCodingToolInspectionDependencies,
): CodingToolInspection {
	const offline = dependencies.isOffline();
	const cachedPath = dependencies.getCachedPath(tool);
	if (cachedPath) {
		const version = dependencies.readVersionMarker(tool) ?? dependencies.probeCommand(cachedPath).version;
		return { tool, source: "cache", path: cachedPath, version, offline };
	}
	const config = getCodingToolReleaseConfig(tool);
	const probe = dependencies.probeCommand(config.binaryName);
	if (probe.exists) {
		return { tool, source: "path", path: config.binaryName, version: probe.version, offline };
	}
	return { tool, source: "missing", offline };
}

/** 从 `--version` 输出提取版本：优先首行的语义化版本串，退化取首个匹配或首行原文。 */
export function parseCodingToolVersionOutput(stdout: string): string | undefined {
	const firstLine = stdout.split("\n", 1)[0]?.trim() ?? "";
	const semver = /v?(\d+\.\d+(?:\.\d+)?[-+.\w]*)/;
	const inline = firstLine.match(semver) ?? stdout.match(semver);
	if (inline?.[1]) return inline[1];
	return firstLine.length > 0 ? firstLine : undefined;
}

function probeCommand(command: string): CodingToolCommandProbe {
	try {
		const result = spawnSync(command, ["--version"], { stdio: "pipe", encoding: "utf8" });
		if (result.error) return { exists: false };
		return { exists: true, version: parseCodingToolVersionOutput(result.stdout ?? "") };
	} catch {
		return { exists: false };
	}
}

export interface EnsureManagedCodingToolExecutableOptions {
	readonly toolsDirectory: string;
	readonly silent?: boolean;
	readonly report?: (message: string) => void;
	readonly recordFailure?: (tool: CodingToolExecutable, message: string) => void;
}

export function ensureManagedCodingToolExecutable(
	tool: CodingToolExecutable,
	options: EnsureManagedCodingToolExecutableOptions,
): Promise<string | undefined> {
	const dependencies = createDefaultManagedExecutableDependencies(options.toolsDirectory, options.recordFailure);
	return resolveManagedCodingToolExecutable(tool, options.silent ?? false, dependencies, options.report);
}

function createDefaultManagedExecutableDependencies(
	toolsDirectory: string,
	recordFailure?: (tool: CodingToolExecutable, message: string) => void,
): ManagedCodingToolExecutableDependencies {
	return {
		getPath: (tool) => getManagedCodingToolPath(tool, toolsDirectory),
		isOffline: isOfflineModeEnabled,
		platform,
		download: (tool) => downloadManagedCodingTool(tool, toolsDirectory),
		recordFailure,
	};
}

function createDefaultInspectionDependencies(toolsDirectory: string): ManagedCodingToolInspectionDependencies {
	return {
		getCachedPath: (tool) => {
			const localPath = join(toolsDirectory, managedBinaryFileName(tool));
			return existsSync(localPath) ? localPath : null;
		},
		readVersionMarker: (tool) => {
			try {
				const markerPath = join(toolsDirectory, `${getCodingToolReleaseConfig(tool).binaryName}.version`);
				if (!existsSync(markerPath)) return null;
				const version = readFileSync(markerPath, "utf8").trim();
				return version.length > 0 ? version : null;
			} catch {
				return null;
			}
		},
		probeCommand,
		isOffline: isOfflineModeEnabled,
	};
}

function managedBinaryFileName(tool: CodingToolExecutable): string {
	return `${getCodingToolReleaseConfig(tool).binaryName}${platform() === "win32" ? ".exe" : ""}`;
}

function getManagedCodingToolPath(tool: CodingToolExecutable, toolsDirectory: string): string | null {
	const config = getCodingToolReleaseConfig(tool);
	const localPath = join(toolsDirectory, `${config.binaryName}${platform() === "win32" ? ".exe" : ""}`);
	if (existsSync(localPath)) return localPath;
	return probeCommand(config.binaryName).exists ? config.binaryName : null;
}

function isOfflineModeEnabled(): boolean {
	const value = process.env.PI_OFFLINE;
	return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "yes";
}

async function downloadManagedCodingTool(tool: CodingToolExecutable, toolsDirectory: string): Promise<string> {
	const config = getCodingToolReleaseConfig(tool);
	const currentPlatform = platform();
	const currentArchitecture = arch();
	const version = await fetchLatestCodingToolVersion(config.repository);
	const plan = createCodingToolDownloadPlan({
		tool,
		version,
		platform: currentPlatform,
		architecture: currentArchitecture,
		toolsDirectory,
	});
	if (!plan) throw new Error(`Unsupported platform: ${currentPlatform}/${currentArchitecture}`);

	mkdirSync(toolsDirectory, { recursive: true });
	await downloadCodingToolArchiveWithRetry(plan.downloadUrl, plan.archivePath);
	const extractDirectory = join(
		toolsDirectory,
		`extract_tmp_${config.binaryName}_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
	);
	mkdirSync(extractDirectory, { recursive: true });
	return installCodingToolArchive({
		plan,
		extractDirectory,
		platform: currentPlatform,
		operations: defaultCodingToolArchiveOperations,
	});
}
