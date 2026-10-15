// Copyright The Open Forge contributors.
export {
	canonicalizeJson,
	sha256CanonicalJson,
} from "./canonical.js";
export {
	checkAutomationPackageCompatibility,
	formatIncompatibilityReason,
} from "./compatibility.js";
export { buildAutomationPackageFromTask, derivePackageId } from "./export.js";
export {
	assertImportMayProceed,
	previewAutomationPackageImport,
	previewAutomationPackageImportJson,
	toDisabledImportCreate,
} from "./import.js";
export { AutomationPackageParseError, parseAutomationPackage, parseAutomationPackageJson } from "./parse.js";
export { compareSemver, isSemverAtLeast } from "./semver.js";
export {
	AUTOMATION_PACKAGE_CAPABILITIES,
	AUTOMATION_PACKAGE_ID_PATTERN,
	AUTOMATION_PACKAGE_SCHEMA_VERSION,
	AUTOMATION_PACKAGE_SEMVER_PATTERN,
	AUTOMATION_TASK_SCHEMA_VERSION,
	type AutomationPackageCapability,
	type AutomationPackageCompatibilityResult,
	type AutomationPackageHostContext,
	type AutomationPackageImportCreate,
	type AutomationPackageImportPreview,
	type AutomationPackageIncompatibilityReason,
	type AutomationPackageInput,
	type AutomationPackageInputType,
	type AutomationPackagePlatform,
	type AutomationPackageRequires,
	type AutomationPackageTaskDefinition,
	type AutomationPackageV1,
} from "./types.js";
