// Modified by The Open Forge contributors.
import { existsSync, renameSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ActionRpcEndpoint } from "./types.js";

export const ACTION_RPC_ENDPOINT_FILE_ENV = "VETTA_ACTION_RPC_ENDPOINT_FILE";
export const VETTA_HOME_ENV = "VETTA_HOME";
export const VETTA_CONFIG_DIR_ENV = "VETTA_CONFIG_DIR";

/**
 * 默认数据根目录名（即品牌名）：用户主目录根 ~/<name> 的唯一来源。
 * 项目内目录（projectDir/.vetta）是插件生态合同，由 coding-agent 的
 * identity.ts 单独承载，不随此值变化。按环境隔离（如 dev）用
 * VETTA_CONFIG_DIR 覆盖。
 */
export const DEFAULT_CONFIG_DIR_NAME = ".openforge";

/** 旧品牌的数据根目录名，仅用于一次性迁移判定。 */
const LEGACY_CONFIG_DIR_NAME = ".vetta";

function expandTilde(p: string): string {
	if (p === "~") return homedir();
	if (p.startsWith("~/")) return join(homedir(), p.slice(2));
	return p;
}

/**
 * 数据根目录名。VETTA_CONFIG_DIR 覆盖，否则用默认品牌名。
 */
export function getVettaConfigDirName(): string {
	return process.env[VETTA_CONFIG_DIR_ENV] || DEFAULT_CONFIG_DIR_NAME;
}

/**
 * 旧品牌数据根整体改名迁移：~/.vetta → ~/.openforge。
 * 仅在新根不存在、旧根存在且未配置任何覆盖时触发；rename 失败（跨盘、占用、
 * 权限）则退回旧根读写，保证已安装用户不丢数据。
 */
function migrateLegacyHomeDir(homeDir: string, configDirName: string): string {
	if (configDirName !== DEFAULT_CONFIG_DIR_NAME) return join(homeDir, configDirName);
	const next = join(homeDir, configDirName);
	if (existsSync(next)) return next;
	const legacy = join(homeDir, LEGACY_CONFIG_DIR_NAME);
	if (!existsSync(legacy)) return next;
	try {
		renameSync(legacy, next);
		return next;
	} catch {
		return legacy;
	}
}

/**
 * 用户主目录下的数据根。VETTA_HOME（绝对路径，支持 ~ 展开）作为逃生口优先，
 * 否则为 ~/<configDirName>。
 */
export function getVettaHomePath(): string {
	const explicit = process.env[VETTA_HOME_ENV];
	if (explicit) return expandTilde(explicit);
	return migrateLegacyHomeDir(homedir(), getVettaConfigDirName());
}

export function getActionRpcEndpointFilePath(): string {
	const envPath = process.env[ACTION_RPC_ENDPOINT_FILE_ENV];
	if (envPath) return envPath;
	return join(getVettaHomePath(), "action-server.json");
}

function parseActionRpcEndpoint(value: unknown, endpointFilePath: string): ActionRpcEndpoint {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`Invalid action server endpoint file: ${endpointFilePath}`);
	}
	const input = value as Record<string, unknown>;
	if (
		input.transport !== "http" ||
		typeof input.url !== "string" ||
		input.url.length === 0 ||
		typeof input.token !== "string" ||
		input.token.length === 0
	) {
		throw new Error(`Invalid action server endpoint file: ${endpointFilePath}`);
	}
	return { transport: "http", url: input.url, token: input.token };
}

/** Read and validate the endpoint advertised by the running Desktop host. */
export async function readActionRpcEndpoint(): Promise<ActionRpcEndpoint> {
	const endpointFilePath = getActionRpcEndpointFilePath();
	const raw = await readFile(endpointFilePath, "utf8");
	return parseActionRpcEndpoint(JSON.parse(raw) as unknown, endpointFilePath);
}
