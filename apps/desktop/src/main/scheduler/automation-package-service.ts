// Copyright The Open Forge contributors.
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import {
	AUTOMATION_PACKAGE_CAPABILITIES,
	AUTOMATION_TASK_SCHEMA_VERSION,
	type AutomationPackageHostContext,
	type AutomationPackageImportPreview,
	type AutomationPackageV1,
	assertImportMayProceed,
	buildAutomationPackageFromTask,
	formatIncompatibilityReason,
	parseAutomationPackageJson,
	previewAutomationPackageImport,
} from "@vetta/coding-agent/runtime";
import AdmZip from "adm-zip";
import { app, BrowserWindow, dialog } from "electron";
import { DESKTOP_BRAND } from "../../shared/desktop-brand.js";
import { type DiscoveredAutomationPackage, discoverAutomationPackages } from "./automation-package-discovery.js";
import {
	AUTOMATION_PACKAGE_MAX_TASK_BYTES,
	AutomationPackageFetchError,
	fetchAutomationPackageBounded,
} from "./automation-package-secure-fetch.js";
import type { SchedulerService } from "./scheduler-service.js";
import type { ScheduledTask } from "./task-storage.js";

export type AutomationPackagePreviewDto = {
	readonly pkg: AutomationPackageV1;
	readonly contentSha256: string;
	readonly compatible: boolean;
	readonly reasons: readonly string[];
};

export type AutomationPackageImportResult =
	| { readonly status: "imported"; readonly taskId: string; readonly enabled: false }
	| { readonly status: "canceled" }
	| { readonly status: "rejected"; readonly reasons: readonly string[] };

export type AutomationPackageExportResult =
	| { readonly status: "exported"; readonly path: string }
	| { readonly status: "canceled" };

function appVersion(): string {
	try {
		return app.getVersion();
	} catch {
		return "0.1.1";
	}
}

function hostPlatform(): AutomationPackageHostContext["platform"] {
	if (process.platform === "darwin" || process.platform === "linux" || process.platform === "win32") {
		return process.platform;
	}
	return "linux";
}

export function buildHostContext(existingTaskIds: ReadonlySet<string>): AutomationPackageHostContext {
	return {
		appVersion: appVersion(),
		taskSchemaVersion: AUTOMATION_TASK_SCHEMA_VERSION,
		capabilities: [...AUTOMATION_PACKAGE_CAPABILITIES],
		platform: hostPlatform(),
		existingTaskIds,
	};
}

function toPreviewDto(preview: AutomationPackageImportPreview): AutomationPackagePreviewDto {
	return {
		pkg: preview.pkg,
		contentSha256: preview.contentSha256,
		compatible: preview.compatibility.ok,
		reasons: preview.compatibility.reasons.map(formatIncompatibilityReason),
	};
}

function focusedWindow(): BrowserWindow | undefined {
	return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

export class AutomationPackageService {
	constructor(private readonly scheduler: SchedulerService) {}

	async previewText(text: string): Promise<AutomationPackagePreviewDto> {
		const tasks = await this.scheduler.listTasks();
		const host = buildHostContext(new Set(tasks.map((task) => task.id)));
		return toPreviewDto(previewAutomationPackageImport(JSON.parse(text) as unknown, host));
	}

	async exportTasks(taskIds: readonly string[]): Promise<AutomationPackageExportResult> {
		const tasks = await this.scheduler.listTasks();
		const selected = tasks.filter((task) => taskIds.includes(task.id));
		if (selected.length === 0) {
			throw new Error("No tasks selected for export");
		}
		const win = focusedWindow();
		if (selected.length === 1) {
			const pkg = buildAutomationPackageFromTask(selected[0]!);
			const save = await dialog.showSaveDialog(win!, {
				title: "Export automation package",
				defaultPath: `${pkg.id}.automation.json`,
				filters: [{ name: `${DESKTOP_BRAND.displayName} Automation Package`, extensions: ["json"] }],
			});
			if (save.canceled || !save.filePath) return { status: "canceled" };
			await writeFile(save.filePath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
			return { status: "exported", path: save.filePath };
		}

		const save = await dialog.showSaveDialog(win!, {
			title: "Export automation packages",
			defaultPath: "automation-packages.zip",
			filters: [{ name: "ZIP archive", extensions: ["zip"] }],
		});
		if (save.canceled || !save.filePath) return { status: "canceled" };
		const zip = new AdmZip();
		for (const task of selected) {
			const pkg = buildAutomationPackageFromTask(task);
			zip.addFile(`${pkg.id}.automation.json`, Buffer.from(`${JSON.stringify(pkg, null, 2)}\n`, "utf8"));
		}
		zip.writeZip(save.filePath);
		return { status: "exported", path: save.filePath };
	}

	async importFromDialog(defaultCwd: string): Promise<AutomationPackageImportResult> {
		const win = focusedWindow();
		const open = await dialog.showOpenDialog(win!, {
			title: "Import automation package",
			properties: ["openFile"],
			filters: [{ name: `${DESKTOP_BRAND.displayName} Automation Package`, extensions: ["json", "zip"] }],
		});
		if (open.canceled || open.filePaths.length === 0) return { status: "canceled" };
		const filePath = open.filePaths[0]!;
		if (filePath.toLowerCase().endsWith(".zip")) {
			return await this.importZip(filePath, defaultCwd);
		}
		const text = await readFile(filePath, "utf8");
		return await this.importPackageText(text, defaultCwd);
	}

	async importFromUrl(url: string, defaultCwd: string): Promise<AutomationPackageImportResult> {
		try {
			const buffer = await fetchAutomationPackageBounded(url, {
				maxBytes: AUTOMATION_PACKAGE_MAX_TASK_BYTES,
			});
			return await this.importPackageText(buffer.toString("utf8"), defaultCwd);
		} catch (error) {
			if (error instanceof AutomationPackageFetchError) {
				return { status: "rejected", reasons: [error.message] };
			}
			throw error;
		}
	}

	async discover(): Promise<readonly DiscoveredAutomationPackage[]> {
		return await discoverAutomationPackages();
	}

	private async importZip(filePath: string, defaultCwd: string): Promise<AutomationPackageImportResult> {
		const zip = new AdmZip(filePath);
		const entries = zip
			.getEntries()
			.filter((entry) => !entry.isDirectory && entry.entryName.toLowerCase().endsWith(".json"));
		if (entries.length === 0) {
			return { status: "rejected", reasons: ["ZIP contains no automation JSON"] };
		}
		// 批量 ZIP：逐个导入；任一失败则返回该条目原因（已导入的保留）。
		let lastImported: string | undefined;
		const rejected: string[] = [];
		for (const entry of entries) {
			const text = entry.getData().toString("utf8");
			const result = await this.importPackageText(text, defaultCwd);
			if (result.status === "imported") lastImported = result.taskId;
			else if (result.status === "rejected") {
				rejected.push(`${basename(entry.entryName)}: ${result.reasons.join("; ")}`);
			}
		}
		if (lastImported) return { status: "imported", taskId: lastImported, enabled: false };
		return { status: "rejected", reasons: rejected.length > 0 ? rejected : ["No packages imported"] };
	}

	private async importPackageText(text: string, defaultCwd: string): Promise<AutomationPackageImportResult> {
		const tasks = await this.scheduler.listTasks();
		const host = buildHostContext(new Set(tasks.map((task) => task.id)));
		let preview: AutomationPackageImportPreview;
		try {
			preview = previewAutomationPackageImport(JSON.parse(text) as unknown, host);
		} catch (error) {
			return {
				status: "rejected",
				reasons: [error instanceof Error ? error.message : "Invalid package JSON"],
			};
		}
		if (!preview.compatibility.ok) {
			return {
				status: "rejected",
				reasons: preview.compatibility.reasons.map(formatIncompatibilityReason),
			};
		}
		const create = assertImportMayProceed(preview);
		const task = await this.scheduler.importTask({
			...create,
			cwd: defaultCwd,
		});
		return { status: "imported", taskId: task.id, enabled: false };
	}
}

/** 供测试：直接校验文本预览形状。 */
export function previewPackageForTest(
	pkg: AutomationPackageV1,
	existingIds: readonly string[] = [],
): AutomationPackagePreviewDto {
	const host = buildHostContext(new Set(existingIds));
	return toPreviewDto(previewAutomationPackageImport(pkg, host));
}

export function parsePackageJsonForTest(text: string): AutomationPackageV1 {
	return parseAutomationPackageJson(text);
}

export type { ScheduledTask };
