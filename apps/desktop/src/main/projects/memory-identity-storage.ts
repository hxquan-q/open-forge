// Modified by The Open Forge contributors.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { MemoryIdentityRegistry, MemoryPrincipalIdentity } from "./memory-identity.js";

/**
 * 记忆身份注册表持久化（TASK-0370）。
 *
 * 单一 JSON 文件（宿主指定的记忆状态目录下 identity-registry.json），
 * 原子写（tmp + rename），带版本标记；损坏文件显式报错不静默重建。
 * runtime-memory v1 schema 已在 SQLite 侧预留 memory_identity_bindings
 * 表；宿主接线（后续切片）把本注册表行迁入同库时按行平移，不双写。
 */

export const MEMORY_IDENTITY_REGISTRY_VERSION = 1;
export const MEMORY_IDENTITY_REGISTRY_FILE = "identity-registry.json";

export class MemoryIdentityStorageError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "MemoryIdentityStorageError";
	}
}

export interface StoredMemoryIdentityRegistry {
	readonly version: number;
	readonly principal: MemoryPrincipalIdentity;
	readonly projects: MemoryIdentityRegistry["projects"];
	readonly workspaceViews: MemoryIdentityRegistry["workspaceViews"];
}

/** 读取注册表；文件不存在返回空注册表（principal 由宿主给定）。 */
export function loadMemoryIdentityRegistry(options: {
	readonly filePath: string;
	readonly principal: MemoryPrincipalIdentity;
}): MemoryIdentityRegistry {
	let text: string;
	try {
		text = readFileSync(options.filePath, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return { principal: options.principal, projects: [], workspaceViews: [] };
		}
		throw new MemoryIdentityStorageError(`无法读取记忆身份注册表：${options.filePath}`, { cause: error });
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		throw new MemoryIdentityStorageError(`记忆身份注册表损坏（不重建，请人工处理）：${options.filePath}`, {
			cause: error,
		});
	}
	const record = parsed as Partial<StoredMemoryIdentityRegistry>;
	if (
		record.version !== MEMORY_IDENTITY_REGISTRY_VERSION ||
		typeof record.principal !== "object" ||
		record.principal === null
	) {
		throw new MemoryIdentityStorageError(
			`记忆身份注册表版本/结构不兼容（version=${String(record.version)}）：${options.filePath}`,
		);
	}
	return {
		principal: record.principal,
		projects: Array.isArray(record.projects) ? record.projects : [],
		workspaceViews: Array.isArray(record.workspaceViews) ? record.workspaceViews : [],
	};
}

/** 原子写回：同目录 tmp 文件 + rename；失败保留原文件。 */
export function saveMemoryIdentityRegistry(options: {
	readonly filePath: string;
	readonly registry: MemoryIdentityRegistry;
}): void {
	const payload: StoredMemoryIdentityRegistry = {
		version: MEMORY_IDENTITY_REGISTRY_VERSION,
		principal: options.registry.principal,
		projects: options.registry.projects,
		workspaceViews: options.registry.workspaceViews,
	};
	const serialized = `${JSON.stringify(payload, null, "\t")}\n`;
	const temporaryPath = `${options.filePath}.tmp`;
	mkdirSync(dirname(options.filePath), { recursive: true });
	writeFileSync(temporaryPath, serialized, "utf8");
	renameSync(temporaryPath, options.filePath);
}

/** 重启合同：写后读回等价（roundtrip）。 */
export function roundTripMemoryIdentityRegistry(registry: MemoryIdentityRegistry): StoredMemoryIdentityRegistry {
	return {
		version: MEMORY_IDENTITY_REGISTRY_VERSION,
		principal: registry.principal,
		projects: registry.projects,
		workspaceViews: registry.workspaceViews,
	};
}
