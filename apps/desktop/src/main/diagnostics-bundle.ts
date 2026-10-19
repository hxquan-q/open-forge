// Modified by The Open Forge contributors.
import { existsSync, readdirSync, statSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { resolveDesktopCodingToolsDirectory } from "@vetta/runtime-desktop";
import type { CodingToolExecutable, CodingToolInspection } from "@vetta/runtime-node/coding";
import { createManagedCodingToolExecutableResolver } from "@vetta/runtime-node/coding";
import AdmZip from "adm-zip";
import { app } from "electron";
import { getPerfMonitorReport } from "./app-monitor/perf-monitor-service.js";
import { logRingBuffer } from "./logger/log-ring-buffer.js";
import { APP_LOG_TYPE_LIST, getAppLogBaseDir, getAppLogger } from "./logger.js";

const diagnosticsLog = getAppLogger("diagnostics");

// 单个诊断包内日志文件的总字节预算：足够带出最近上下文，又不至于产出超大 zip。
const MAX_LOG_BYTES = 20 * 1024 * 1024;
// 每个 type 目录最多纳入的文件数（按 mtime 取最新）。
const MAX_FILES_PER_TYPE = 6;

const MANAGED_CODING_TOOLS: readonly CodingToolExecutable[] = ["fd", "rg"];

export interface DiagnosticsBundleResult {
	zipPath: string;
	sizeBytes: number;
}

export type ManagedCodingToolsInspector = (tool: CodingToolExecutable) => Promise<CodingToolInspection>;

export interface DiagnosticsBundleOptions {
	/** 受管工具解析记录注入点；缺省用 toolsDirectory 的本机静态检查。 */
	readonly managedToolsInspector?: ManagedCodingToolsInspector;
}

// 打包诊断 zip：最近日志文件（各 type 取最新若干，受总字节预算约束）+ 内存 ring
// buffer 序列化的 NDJSON + 系统信息 + 受管编码工具解析记录。落到 temp 目录，由调用方
// 决定如何呈现给用户。用异步 deflate + 异步写盘（writeZipPromise），避免同步压缩
// ~20MB 阻塞主进程事件循环。
export async function buildDiagnosticsBundle(options: DiagnosticsBundleOptions = {}): Promise<DiagnosticsBundleResult> {
	const zip = new AdmZip();
	addRecentLogs(zip);
	addRingBuffer(zip);
	addSystemInfo(zip);
	addPerfSnapshot(zip);
	await addManagedTools(zip, options.managedToolsInspector);

	const zipPath = join(app.getPath("temp"), `vetta-diagnostics-${nowStamp()}.zip`);
	await zip.writeZipPromise(zipPath);
	return { zipPath, sizeBytes: (await stat(zipPath)).size };
}

function addRecentLogs(zip: AdmZip): void {
	const baseDir = getAppLogBaseDir();
	let budget = MAX_LOG_BYTES;
	for (const type of APP_LOG_TYPE_LIST) {
		const dir = join(baseDir, type);
		if (!existsSync(dir)) continue;
		const files = recentFiles(dir, MAX_FILES_PER_TYPE);
		for (const file of files) {
			// 单个超额文件只跳过自己，继续尝试该 type 下更小/更老的文件，而非整组放弃。
			if (budget - file.size < 0) continue;
			budget -= file.size;
			zip.addLocalFile(file.path, `logs/${type}`);
		}
	}
}

function recentFiles(dir: string, limit: number): Array<{ path: string; size: number }> {
	const entries: Array<{ path: string; size: number; mtimeMs: number }> = [];
	for (const filename of readdirSync(dir)) {
		if (!filename.endsWith(".log")) continue;
		const path = join(dir, filename);
		try {
			const stat = statSync(path);
			entries.push({ path, size: stat.size, mtimeMs: stat.mtimeMs });
		} catch {
			// File vanished; skip.
		}
	}
	return entries.sort((left, right) => right.mtimeMs - left.mtimeMs).slice(0, limit);
}

function addRingBuffer(zip: AdmZip): void {
	const lines = logRingBuffer
		.snapshot()
		.map((entry) => JSON.stringify(entry))
		.join("\n");
	zip.addFile("ring-buffer.ndjson", Buffer.from(lines, "utf-8"));
}

function addSystemInfo(zip: AdmZip): void {
	const info = {
		version: app.getVersion(),
		platform: process.platform,
		arch: process.arch,
		node: process.versions.node,
		electron: process.versions.electron,
		locale: app.getLocale(),
		exportedAt: new Date().toISOString(),
	};
	zip.addFile("system-info.json", Buffer.from(JSON.stringify(info, null, 2), "utf-8"));
}

// 性能快照只含数字与稳定 id，随诊断包带出 Turn/排队/压缩/进程指标，供线上回归定位。
function addPerfSnapshot(zip: AdmZip): void {
	try {
		zip.addFile("perf-snapshot.json", Buffer.from(JSON.stringify(getPerfMonitorReport(), null, 2), "utf-8"));
	} catch (error) {
		diagnosticsLog.warn("perf snapshot collection failed", error);
	}
}

/**
 * 受管编码工具（fd/rg）解析记录：来源/路径/版本/离线态与 `openforge doctor` 同源，
 * 纯静态检查（不下载、不联网）。采集失败只降级为缺该文件，不让诊断包导出整体失败。
 */
async function addManagedTools(zip: AdmZip, inspector?: ManagedCodingToolsInspector): Promise<void> {
	try {
		const toolsDirectory = resolveDesktopCodingToolsDirectory();
		const resolve = inspector ?? createManagedCodingToolsInspector(toolsDirectory);
		const tools = await Promise.all(MANAGED_CODING_TOOLS.map((tool) => resolve(tool)));
		zip.addFile(
			"managed-tools.json",
			Buffer.from(
				JSON.stringify({ toolsDirectory, generatedAt: new Date().toISOString(), tools }, null, 2),
				"utf-8",
			),
		);
	} catch (error) {
		diagnosticsLog.warn("managed tools collection failed", error);
	}
}

function createManagedCodingToolsInspector(toolsDirectory: string): ManagedCodingToolsInspector {
	const resolver = createManagedCodingToolExecutableResolver({ toolsDirectory });
	return (tool) =>
		resolver.inspect
			? resolver.inspect(tool)
			: Promise.resolve({ tool, source: "missing", offline: false } satisfies CodingToolInspection);
}

function nowStamp(): string {
	return new Date().toISOString().replace(/[:.]/g, "-");
}
