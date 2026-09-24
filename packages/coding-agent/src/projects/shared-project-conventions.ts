// Copyright The Open Forge contributors.
import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

/**
 * 项目级共享约定（TASK-0020）：`.vetta/` 目录随 Git 共享，`.vetta-local/` 只在本机。
 *
 * - `.vetta/project.json` 是清单（schemaVersion + 各子目录的启用声明）；
 * - 缺清单 = v0 旧行为（只认目录存在），完全向后兼容；
 * - 未知 schemaVersion fail closed：报出可恢复的错误，不猜格式、不读内容；
 * - 所有路径收窄在 project root 内，拒绝逃逸。
 */

export const VETTA_PROJECT_DIRECTORY = ".vetta";
export const VETTA_LOCAL_PROJECT_DIRECTORY = ".vetta-local";
export const VETTA_PROJECT_MANIFEST_FILE = "project.json";

/** 当前支持的清单 schema 版本。 */
export const CURRENT_VETTA_PROJECT_SCHEMA_VERSION = 1;

/** 未知版本的 fail-closed 错误：给出恢复路径而不是猜格式。 */
export class VettaProjectManifestError extends Error {
	constructor(
		readonly code: "unknown-schema-version" | "invalid-manifest" | "path-escape",
		message: string,
	) {
		super(message);
		this.name = "VettaProjectManifestError";
	}
}

export const VettaProjectManifestSchema = Type.Object(
	{
		schemaVersion: Type.Integer({ minimum: 1, maximum: CURRENT_VETTA_PROJECT_SCHEMA_VERSION }),
		/** 各子目录的启用声明；缺省 = true（目录存在即装载）。 */
		agents: Type.Optional(Type.Boolean()),
		skills: Type.Optional(Type.Boolean()),
		taskTemplates: Type.Optional(Type.Boolean()),
		policies: Type.Optional(Type.Boolean()),
	},
	{ additionalProperties: false },
);

export type VettaProjectManifest = Static<typeof VettaProjectManifestSchema>;

/** 装载结果：v0（无清单）与 v1 统一成同一个只读视图。 */
export interface SharedProjectConventions {
	readonly schemaVersion: number;
	readonly root: string;
	readonly agentsEnabled: boolean;
	readonly skillsEnabled: boolean;
	readonly taskTemplatesEnabled: boolean;
	readonly policiesEnabled: boolean;
}

/** v0（目录存在、无清单）的兼容默认。 */
export function legacyProjectConventions(root: string): SharedProjectConventions {
	return {
		schemaVersion: 0,
		root,
		agentsEnabled: true,
		skillsEnabled: true,
		taskTemplatesEnabled: true,
		policiesEnabled: true,
	};
}

/** 收窄清单：未知字段丢弃；未知版本/结构损坏抛 VettaProjectManifestError。 */
export function readVettaProjectManifest(value: unknown): VettaProjectManifest {
	if (typeof value !== "object" || value === null) {
		throw new VettaProjectManifestError("invalid-manifest", "project manifest is not an object");
	}
	const version = (value as { schemaVersion?: unknown }).schemaVersion;
	if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
		throw new VettaProjectManifestError("invalid-manifest", "project manifest is missing an integer schemaVersion");
	}
	if (version > CURRENT_VETTA_PROJECT_SCHEMA_VERSION) {
		throw new VettaProjectManifestError(
			"unknown-schema-version",
			`project manifest schema version ${version} is newer than supported ${CURRENT_VETTA_PROJECT_SCHEMA_VERSION}; upgrade the app or remove ${VETTA_PROJECT_DIRECTORY}/${VETTA_PROJECT_MANIFEST_FILE}`,
		);
	}
	if (!Value.Check(VettaProjectManifestSchema, value)) {
		throw new VettaProjectManifestError("invalid-manifest", "project manifest does not match the v1 schema");
	}
	return value;
}

export function conventionsFromManifest(root: string, manifest: VettaProjectManifest): SharedProjectConventions {
	return {
		schemaVersion: manifest.schemaVersion,
		root,
		agentsEnabled: manifest.agents ?? true,
		skillsEnabled: manifest.skills ?? true,
		taskTemplatesEnabled: manifest.taskTemplates ?? true,
		policiesEnabled: manifest.policies ?? true,
	};
}

/** 子目录名与合同一致；供装载器与文档共同引用。 */
export const VETTA_PROJECT_SUBDIRECTORIES = ["agents", "skills", "task-templates", "policies"] as const;
export type VettaProjectSubdirectory = (typeof VETTA_PROJECT_SUBDIRECTORIES)[number];

/** `.vetta-local/` 忽略引导写入 .gitignore 的标记段。 */
export const VETTA_LOCAL_GITIGNORE_MARKER = "# openforge local state (task 0020)";
export const VETTA_LOCAL_GITIGNORE_LINES = [VETTA_LOCAL_GITIGNORE_MARKER, ".vetta-local/"] as const;

/** 判断一段 .gitignore 内容是否已经包含 `.vetta-local/` 忽略（含既有手写行）。 */
export function gitignoreCoversVettaLocal(contents: string): boolean {
	return contents.split(/\r?\n/).some((line) => line.trim() === ".vetta-local/" || line.trim() === ".vetta-local");
}

/** 生成需要追加的忽略段；已覆盖时返回空串。 */
export function gitignoreAdditionForVettaLocal(contents: string): string {
	if (gitignoreCoversVettaLocal(contents)) return "";
	return `${VETTA_LOCAL_GITIGNORE_LINES.join("\n")}\n`;
}
