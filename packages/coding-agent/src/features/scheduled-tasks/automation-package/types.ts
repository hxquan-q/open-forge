// Copyright The Open Forge contributors.
/**
 * automation-package.v1 —— 可分享定时任务封套合同（TASK-0117）。
 *
 * 包只含任务定义；凭据与会话数据不得进入封套。导入默认停用由宿主强制。
 */
import type { AgentScheduledTaskExecutionMode, AgentScheduledTaskSkillRef } from "../contracts.js";
import type { UnattendedPermissionTiers } from "../unattended-permission-tiers.js";

/** 当前宿主认识的任务定义 schema 主版本。 */
export const AUTOMATION_TASK_SCHEMA_VERSION = 1;

/** 封套 schema 主版本。 */
export const AUTOMATION_PACKAGE_SCHEMA_VERSION = 1 as const;

export const AUTOMATION_PACKAGE_ID_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/;
export const AUTOMATION_PACKAGE_SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/** 宿主可声明的能力标记；包 `requires.capabilities` 只能引用这些。 */
export const AUTOMATION_PACKAGE_CAPABILITIES = [
	"scheduler.cron",
	"scheduler.skill",
	"scheduler.permissionTiers",
] as const;

export type AutomationPackageCapability = (typeof AUTOMATION_PACKAGE_CAPABILITIES)[number];

export type AutomationPackagePlatform = "win32" | "darwin" | "linux";

export type AutomationPackageInputType = "string" | "number" | "boolean" | "path";

export interface AutomationPackageInput {
	readonly key: string;
	readonly type: AutomationPackageInputType;
	readonly label: string;
	readonly description?: string;
	readonly required?: boolean;
	readonly default?: string | number | boolean;
}

export interface AutomationPackageRequires {
	readonly minAppVersion?: string;
	readonly taskSchemaVersion: number;
	readonly capabilities?: readonly string[];
	readonly platforms?: readonly AutomationPackagePlatform[];
}

/** 封套内可移植任务体（无 id / cwd / 运行态）。 */
export interface AutomationPackageTaskDefinition {
	readonly name: string;
	readonly prompt: string;
	readonly cron: string;
	readonly isOnce?: boolean;
	readonly modelKey?: string;
	readonly executionMode?: AgentScheduledTaskExecutionMode;
	readonly skill?: AgentScheduledTaskSkillRef;
	readonly permissionTiers?: UnattendedPermissionTiers;
}

export interface AutomationPackageV1 {
	readonly schemaVersion: typeof AUTOMATION_PACKAGE_SCHEMA_VERSION;
	readonly id: string;
	readonly version: string;
	readonly name: string;
	readonly description?: string;
	readonly requires: AutomationPackageRequires;
	readonly inputs?: readonly AutomationPackageInput[];
	readonly task: AutomationPackageTaskDefinition;
}

export type AutomationPackageIncompatibilityReason =
	| { readonly code: "app_version"; readonly required: string; readonly actual: string }
	| { readonly code: "task_schema"; readonly required: number; readonly actual: number }
	| { readonly code: "capability"; readonly missing: readonly string[] }
	| { readonly code: "platform"; readonly required: readonly string[]; readonly actual: string }
	| { readonly code: "id_exists"; readonly id: string }
	| { readonly code: "schema_invalid"; readonly detail: string };

export interface AutomationPackageHostContext {
	readonly appVersion: string;
	readonly taskSchemaVersion: number;
	readonly capabilities: readonly string[];
	readonly platform: AutomationPackagePlatform;
	readonly existingTaskIds: ReadonlySet<string>;
}

export interface AutomationPackageCompatibilityResult {
	readonly ok: boolean;
	readonly reasons: readonly AutomationPackageIncompatibilityReason[];
}

/** 导入预览：只读，不含副作用。 */
export interface AutomationPackageImportPreview {
	readonly pkg: AutomationPackageV1;
	readonly contentSha256: string;
	readonly compatibility: AutomationPackageCompatibilityResult;
}

/** 通过兼容检查后交给宿主落库的创建载荷（enabled 恒为 false）。 */
export interface AutomationPackageImportCreate {
	readonly id: string;
	readonly name: string;
	readonly prompt: string;
	readonly cron: string;
	readonly isOnce: boolean;
	readonly enabled: false;
	readonly modelKey?: string;
	readonly executionMode?: AgentScheduledTaskExecutionMode;
	readonly skill?: AgentScheduledTaskSkillRef;
	readonly permissionTiers?: UnattendedPermissionTiers;
}
