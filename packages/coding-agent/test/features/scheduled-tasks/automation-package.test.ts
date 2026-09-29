// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	type AutomationPackageHostContext,
	type AutomationPackageV1,
	assertImportMayProceed,
	buildAutomationPackageFromTask,
	checkAutomationPackageCompatibility,
	parseAutomationPackage,
	previewAutomationPackageImport,
	sha256CanonicalJson,
	toDisabledImportCreate,
} from "../../../src/features/scheduled-tasks/automation-package/index.js";

const BASE_HOST: AutomationPackageHostContext = {
	appVersion: "0.1.1",
	taskSchemaVersion: 1,
	capabilities: ["scheduler.cron", "scheduler.skill", "scheduler.permissionTiers"],
	platform: "win32",
	existingTaskIds: new Set(),
};

function samplePackage(overrides: Partial<AutomationPackageV1> = {}): AutomationPackageV1 {
	return {
		schemaVersion: 1,
		id: "com.example.morning-brief",
		version: "1.0.0",
		name: "Morning brief",
		requires: { taskSchemaVersion: 1, capabilities: ["scheduler.cron"] },
		task: {
			name: "Morning brief",
			prompt: "Summarize git status",
			cron: "0 9 * * 1-5",
			isOnce: false,
		},
		...overrides,
	};
}

describe("parseAutomationPackage", () => {
	it("accepts a valid v1 package and normalizes permission tiers", () => {
		const pkg = parseAutomationPackage({
			...samplePackage(),
			task: {
				...samplePackage().task,
				permissionTiers: { allowWorkspaceWrite: true, allowCommonCommands: false },
			},
		});
		expect(pkg.id).toBe("com.example.morning-brief");
		expect(pkg.task.permissionTiers?.allowWorkspaceWrite).toBe(true);
		expect(pkg.task.permissionTiers?.allowCommonCommands).toBe(false);
	});

	it("rejects non-dotted ids and unknown schema versions", () => {
		expect(() => parseAutomationPackage({ ...samplePackage(), id: "Not-Valid" })).toThrow(/dotted/i);
		expect(() => parseAutomationPackage({ ...samplePackage(), schemaVersion: 99 })).toThrow(/schemaVersion/i);
	});
});

describe("checkAutomationPackageCompatibility", () => {
	it("reports app version / capability / platform / id conflicts separately", () => {
		const pkg = samplePackage({
			requires: {
				taskSchemaVersion: 2,
				minAppVersion: "0.2.0",
				capabilities: ["scheduler.cron", "scheduler.missing"],
				platforms: ["darwin"],
			},
		});
		const result = checkAutomationPackageCompatibility(pkg, {
			...BASE_HOST,
			existingTaskIds: new Set(["com.example.morning-brief"]),
		});
		expect(result.ok).toBe(false);
		expect(result.reasons.map((reason) => reason.code).sort()).toEqual([
			"app_version",
			"capability",
			"id_exists",
			"platform",
			"task_schema",
		]);
	});

	it("passes when host satisfies all requires", () => {
		expect(checkAutomationPackageCompatibility(samplePackage(), BASE_HOST).ok).toBe(true);
	});
});

describe("import defaults disabled", () => {
	it("forces enabled=false even when source enabled semantics are absent", () => {
		const create = toDisabledImportCreate(samplePackage());
		expect(create.enabled).toBe(false);
		expect(create.id).toBe("com.example.morning-brief");
	});

	it("assertImportMayProceed refuses incompatible packages", () => {
		const preview = previewAutomationPackageImport(
			samplePackage({
				requires: { taskSchemaVersion: 1, minAppVersion: "9.0.0" },
			}),
			BASE_HOST,
		);
		expect(() => assertImportMayProceed(preview)).toThrow(/incompatible/i);
	});
});

describe("export + canonical identity", () => {
	it("exports a local task and keeps sha256 stable under key reordering", () => {
		const pkg = buildAutomationPackageFromTask({
			id: "1730000000-abcdefghi",
			name: "Daily wrap",
			prompt: "Write a summary",
			cron: "0 18 * * *",
			isOnce: false,
		});
		expect(pkg.id).toBe("local.openforge.daily-wrap");
		const reshuffled = {
			version: pkg.version,
			task: pkg.task,
			name: pkg.name,
			id: pkg.id,
			requires: pkg.requires,
			schemaVersion: pkg.schemaVersion,
		};
		expect(sha256CanonicalJson(pkg)).toBe(sha256CanonicalJson(reshuffled));
	});
});
