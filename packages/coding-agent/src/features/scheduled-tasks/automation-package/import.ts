// Copyright The Open Forge contributors.
import { sha256CanonicalJson } from "./canonical.js";
import { checkAutomationPackageCompatibility } from "./compatibility.js";
import { parseAutomationPackage, parseAutomationPackageJson } from "./parse.js";
import type {
	AutomationPackageHostContext,
	AutomationPackageImportCreate,
	AutomationPackageImportPreview,
	AutomationPackageV1,
} from "./types.js";

export function previewAutomationPackageImport(
	raw: unknown,
	host: AutomationPackageHostContext,
): AutomationPackageImportPreview {
	const pkg = parseAutomationPackage(raw);
	return {
		pkg,
		contentSha256: sha256CanonicalJson(pkg),
		compatibility: checkAutomationPackageCompatibility(pkg, host),
	};
}

export function previewAutomationPackageImportJson(
	text: string,
	host: AutomationPackageHostContext,
): AutomationPackageImportPreview {
	const pkg = parseAutomationPackageJson(text);
	return {
		pkg,
		contentSha256: sha256CanonicalJson(pkg),
		compatibility: checkAutomationPackageCompatibility(pkg, host),
	};
}

/**
 * 将已通过兼容检查的包转为宿主创建载荷。
 * **硬约束**：`enabled` 恒为 `false`——远端/导入内容永不自动执行。
 */
export function toDisabledImportCreate(pkg: AutomationPackageV1): AutomationPackageImportCreate {
	return {
		id: pkg.id,
		name: pkg.task.name,
		prompt: pkg.task.prompt,
		cron: pkg.task.cron,
		isOnce: pkg.task.isOnce ?? false,
		enabled: false,
		...(pkg.task.modelKey !== undefined ? { modelKey: pkg.task.modelKey } : {}),
		...(pkg.task.executionMode !== undefined ? { executionMode: pkg.task.executionMode } : {}),
		...(pkg.task.skill !== undefined ? { skill: pkg.task.skill } : {}),
		...(pkg.task.permissionTiers !== undefined ? { permissionTiers: pkg.task.permissionTiers } : {}),
	};
}

export function assertImportMayProceed(preview: AutomationPackageImportPreview): AutomationPackageImportCreate {
	if (!preview.compatibility.ok) {
		const detail = preview.compatibility.reasons.map((reason) => reason.code).join(",");
		throw new Error(`Automation package incompatible: ${detail}`);
	}
	return toDisabledImportCreate(preview.pkg);
}
