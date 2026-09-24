// Copyright The Open Forge contributors.
import { normalizeUnattendedPermissionTiers } from "../unattended-permission-tiers.js";
import {
	AUTOMATION_PACKAGE_ID_PATTERN,
	AUTOMATION_PACKAGE_SCHEMA_VERSION,
	AUTOMATION_PACKAGE_SEMVER_PATTERN,
	type AutomationPackageInput,
	type AutomationPackagePlatform,
	type AutomationPackageTaskDefinition,
	type AutomationPackageV1,
} from "./types.js";

export class AutomationPackageParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AutomationPackageParseError";
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value != null && typeof value === "object" && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function parsePlatforms(value: unknown): readonly AutomationPackagePlatform[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) {
		throw new AutomationPackageParseError("requires.platforms must be an array");
	}
	const allowed = new Set(["win32", "darwin", "linux"]);
	const out: AutomationPackagePlatform[] = [];
	for (const item of value) {
		if (typeof item !== "string" || !allowed.has(item)) {
			throw new AutomationPackageParseError(`Unsupported platform: ${String(item)}`);
		}
		if (!out.includes(item as AutomationPackagePlatform)) {
			out.push(item as AutomationPackagePlatform);
		}
	}
	return out;
}

function parseInputs(value: unknown): readonly AutomationPackageInput[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) {
		throw new AutomationPackageParseError("inputs must be an array");
	}
	const out: AutomationPackageInput[] = [];
	for (const raw of value) {
		if (!isPlainObject(raw)) {
			throw new AutomationPackageParseError("input entry must be an object");
		}
		if (!isNonBlankString(raw.key) || !/^[a-z][a-zA-Z0-9]*$/.test(raw.key)) {
			throw new AutomationPackageParseError("input.key must be a camelCase identifier");
		}
		if (raw.type !== "string" && raw.type !== "number" && raw.type !== "boolean" && raw.type !== "path") {
			throw new AutomationPackageParseError(`Unsupported input type: ${String(raw.type)}`);
		}
		if (!isNonBlankString(raw.label)) {
			throw new AutomationPackageParseError("input.label is required");
		}
		const entry: AutomationPackageInput = {
			key: raw.key,
			type: raw.type,
			label: raw.label.trim(),
			...(isNonBlankString(raw.description) ? { description: raw.description.trim() } : {}),
			...(typeof raw.required === "boolean" ? { required: raw.required } : {}),
			...(raw.default === undefined ||
			typeof raw.default === "string" ||
			typeof raw.default === "number" ||
			typeof raw.default === "boolean"
				? raw.default === undefined
					? {}
					: { default: raw.default }
				: (() => {
						throw new AutomationPackageParseError("input.default must be string|number|boolean");
					})()),
		};
		out.push(entry);
	}
	return out;
}

function parseSkill(value: unknown): AutomationPackageTaskDefinition["skill"] {
	if (value === undefined) return undefined;
	if (!isPlainObject(value)) {
		throw new AutomationPackageParseError("task.skill must be an object");
	}
	if (!isNonBlankString(value.name)) {
		throw new AutomationPackageParseError("task.skill.name is required");
	}
	if (value.type !== "skill" && value.type !== "scene") {
		throw new AutomationPackageParseError("task.skill.type must be skill|scene");
	}
	if (value.alias !== undefined && !isNonBlankString(value.alias)) {
		throw new AutomationPackageParseError("task.skill.alias must be a non-empty string");
	}
	const extra = Object.keys(value).filter((key) => key !== "name" && key !== "alias" && key !== "type");
	if (extra.length > 0) {
		throw new AutomationPackageParseError(`task.skill has unknown keys: ${extra.join(",")}`);
	}
	return {
		name: value.name.trim(),
		type: value.type,
		...(value.alias !== undefined ? { alias: value.alias.trim() } : {}),
	};
}

function parseTask(value: unknown): AutomationPackageTaskDefinition {
	if (!isPlainObject(value)) {
		throw new AutomationPackageParseError("task must be an object");
	}
	if (!isNonBlankString(value.name) || !isNonBlankString(value.prompt) || !isNonBlankString(value.cron)) {
		throw new AutomationPackageParseError("task.name, task.prompt, and task.cron are required");
	}
	if (value.isOnce !== undefined && typeof value.isOnce !== "boolean") {
		throw new AutomationPackageParseError("task.isOnce must be boolean");
	}
	if (value.modelKey !== undefined && !isNonBlankString(value.modelKey)) {
		throw new AutomationPackageParseError("task.modelKey must be a non-empty string");
	}
	if (
		value.executionMode !== undefined &&
		value.executionMode !== "inherit" &&
		value.executionMode !== "sandbox" &&
		value.executionMode !== "full-access"
	) {
		throw new AutomationPackageParseError("task.executionMode must be inherit|sandbox|full-access");
	}
	const permissionTiers =
		value.permissionTiers === undefined ? undefined : normalizeUnattendedPermissionTiers(value.permissionTiers);
	if (value.permissionTiers !== undefined && permissionTiers === undefined) {
		throw new AutomationPackageParseError("task.permissionTiers is invalid");
	}
	const skill = parseSkill(value.skill);
	return {
		name: value.name.trim(),
		prompt: value.prompt,
		cron: value.cron.trim(),
		...(value.isOnce !== undefined ? { isOnce: value.isOnce } : {}),
		...(value.modelKey !== undefined ? { modelKey: value.modelKey.trim() } : {}),
		...(value.executionMode !== undefined ? { executionMode: value.executionMode } : {}),
		...(skill !== undefined ? { skill } : {}),
		...(permissionTiers !== undefined ? { permissionTiers } : {}),
	};
}

/**
 * 解析并归一化 automation-package.v1。
 * 非法结构抛 `AutomationPackageParseError`；不执行任何宿主副作用。
 */
export function parseAutomationPackage(raw: unknown): AutomationPackageV1 {
	if (!isPlainObject(raw)) {
		throw new AutomationPackageParseError("Package must be a JSON object");
	}
	if (raw.schemaVersion !== AUTOMATION_PACKAGE_SCHEMA_VERSION) {
		throw new AutomationPackageParseError(
			`Unsupported schemaVersion: ${String(raw.schemaVersion)} (expected ${AUTOMATION_PACKAGE_SCHEMA_VERSION})`,
		);
	}
	if (!isNonBlankString(raw.id) || !AUTOMATION_PACKAGE_ID_PATTERN.test(raw.id)) {
		throw new AutomationPackageParseError("id must be a dotted lowercase identifier (e.g. com.example.task)");
	}
	if (!isNonBlankString(raw.version) || !AUTOMATION_PACKAGE_SEMVER_PATTERN.test(raw.version)) {
		throw new AutomationPackageParseError("version must be semver (major.minor.patch)");
	}
	if (!isNonBlankString(raw.name)) {
		throw new AutomationPackageParseError("name is required");
	}
	if (raw.description !== undefined && typeof raw.description !== "string") {
		throw new AutomationPackageParseError("description must be a string");
	}
	if (!isPlainObject(raw.requires)) {
		throw new AutomationPackageParseError("requires must be an object");
	}
	if (
		typeof raw.requires.taskSchemaVersion !== "number" ||
		!Number.isInteger(raw.requires.taskSchemaVersion) ||
		raw.requires.taskSchemaVersion < 1
	) {
		throw new AutomationPackageParseError("requires.taskSchemaVersion must be a positive integer");
	}
	if (
		raw.requires.minAppVersion !== undefined &&
		(!isNonBlankString(raw.requires.minAppVersion) ||
			!AUTOMATION_PACKAGE_SEMVER_PATTERN.test(raw.requires.minAppVersion))
	) {
		throw new AutomationPackageParseError("requires.minAppVersion must be semver");
	}
	if (raw.requires.capabilities !== undefined) {
		if (!Array.isArray(raw.requires.capabilities) || !raw.requires.capabilities.every(isNonBlankString)) {
			throw new AutomationPackageParseError("requires.capabilities must be a string array");
		}
	}
	const requires = {
		taskSchemaVersion: raw.requires.taskSchemaVersion,
		...(raw.requires.minAppVersion !== undefined ? { minAppVersion: raw.requires.minAppVersion } : {}),
		...(raw.requires.capabilities !== undefined
			? { capabilities: [...new Set(raw.requires.capabilities.map((item) => item.trim()))] }
			: {}),
		...(parsePlatforms(raw.requires.platforms) !== undefined
			? { platforms: parsePlatforms(raw.requires.platforms) }
			: {}),
	};
	const task = parseTask(raw.task);
	const inputs = parseInputs(raw.inputs);
	return {
		schemaVersion: AUTOMATION_PACKAGE_SCHEMA_VERSION,
		id: raw.id,
		version: raw.version,
		name: raw.name.trim(),
		...(raw.description !== undefined ? { description: raw.description } : {}),
		requires,
		...(inputs !== undefined ? { inputs } : {}),
		task,
	};
}

export function parseAutomationPackageJson(text: string): AutomationPackageV1 {
	let raw: unknown;
	try {
		raw = JSON.parse(text) as unknown;
	} catch {
		throw new AutomationPackageParseError("Package JSON is not valid");
	}
	return parseAutomationPackage(raw);
}
