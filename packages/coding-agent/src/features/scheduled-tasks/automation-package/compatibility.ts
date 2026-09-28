// Copyright The Open Forge contributors.
import { isSemverAtLeast } from "./semver.js";
import type {
	AutomationPackageCompatibilityResult,
	AutomationPackageHostContext,
	AutomationPackageIncompatibilityReason,
	AutomationPackageV1,
} from "./types.js";

/**
 * 兼容检查：版本 / 能力 / 平台 / 同 ID 不覆盖。
 * 返回全部不兼容原因，便于 UI 逐条展示。
 */
export function checkAutomationPackageCompatibility(
	pkg: AutomationPackageV1,
	host: AutomationPackageHostContext,
): AutomationPackageCompatibilityResult {
	const reasons: AutomationPackageIncompatibilityReason[] = [];

	if (pkg.requires.minAppVersion !== undefined && !isSemverAtLeast(host.appVersion, pkg.requires.minAppVersion)) {
		reasons.push({
			code: "app_version",
			required: pkg.requires.minAppVersion,
			actual: host.appVersion,
		});
	}

	if (pkg.requires.taskSchemaVersion > host.taskSchemaVersion) {
		reasons.push({
			code: "task_schema",
			required: pkg.requires.taskSchemaVersion,
			actual: host.taskSchemaVersion,
		});
	}

	if (pkg.requires.capabilities !== undefined && pkg.requires.capabilities.length > 0) {
		const hostCaps = new Set(host.capabilities);
		const missing = pkg.requires.capabilities.filter((cap) => !hostCaps.has(cap));
		if (missing.length > 0) {
			reasons.push({ code: "capability", missing });
		}
	}

	if (pkg.requires.platforms !== undefined && pkg.requires.platforms.length > 0) {
		if (!pkg.requires.platforms.includes(host.platform)) {
			reasons.push({
				code: "platform",
				required: [...pkg.requires.platforms],
				actual: host.platform,
			});
		}
	}

	if (host.existingTaskIds.has(pkg.id)) {
		reasons.push({ code: "id_exists", id: pkg.id });
	}

	return { ok: reasons.length === 0, reasons };
}

export function formatIncompatibilityReason(reason: AutomationPackageIncompatibilityReason): string {
	switch (reason.code) {
		case "app_version":
			return `Requires app ≥ ${reason.required} (current ${reason.actual})`;
		case "task_schema":
			return `Requires task schema v${reason.required} (host supports v${reason.actual})`;
		case "capability":
			return `Missing capabilities: ${reason.missing.join(", ")}`;
		case "platform":
			return `Requires platform ${reason.required.join("|")} (current ${reason.actual})`;
		case "id_exists":
			return `A task with id "${reason.id}" already exists`;
		case "schema_invalid":
			return reason.detail;
	}
}
