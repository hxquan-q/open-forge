// Copyright The Open Forge contributors.

import { join } from "node:path";
import { getVettaHomePath } from "@vetta/action-rpc";
import { createVersionedJsonConfigStore } from "@vetta/toolkit/config-store";

/**
 * 智能客服的**普通配置**（baseUrl / defaultAgentId / pageSize）。
 *
 * 与 API Key 分离：Key 是凭据，走 credentials.ts 的 Electron safeStorage（红线 C2）。
 * 单独成文件（而非并入 desktop-config.json）沿用 ssh-hosts.json 的先例——一个领域只对
 * 自己的配置负责，避免与其它领域的 schema 迁移互相牵连（红线 C8 的意图）。
 */

/** 01-spec §3.6 的默认值。 */
export const DEFAULT_WEKNORA_BASE_URL = "http://183.36.30.83:8083";
export const DEFAULT_WEKNORA_AGENT_ID = "d5b71e00-fa27-42df-89ca-14f0bf7e8644";
export const DEFAULT_WEKNORA_PAGE_SIZE = 50;

export interface WeKnoraConfig {
	baseUrl: string;
	defaultAgentId: string;
	pageSize: number;
}

/** 可增量更新的配置字段（频道 `set-config` 的入参）。 */
export interface WeKnoraConfigPatch {
	baseUrl?: string;
	defaultAgentId?: string;
	pageSize?: number;
}

const WEKNORA_CONFIG_PATH = join(getVettaHomePath(), "weknora-config.json");

function normalizeNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizePageSize(value: unknown): number {
	return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : DEFAULT_WEKNORA_PAGE_SIZE;
}

/** 把任意来源（磁盘 / 迁移结果）收窄成稳定形状；缺省与非法值都回落到 01-spec §3.6 的默认值。 */
export function normalizeWeKnoraConfig(value: unknown): WeKnoraConfig {
	const input = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
	return {
		baseUrl: normalizeNonEmptyString(input.baseUrl) ?? DEFAULT_WEKNORA_BASE_URL,
		defaultAgentId: normalizeNonEmptyString(input.defaultAgentId) ?? DEFAULT_WEKNORA_AGENT_ID,
		pageSize: normalizePageSize(input.pageSize),
	};
}

const weKnoraConfigStore = createVersionedJsonConfigStore<WeKnoraConfig>({
	path: WEKNORA_CONFIG_PATH,
	name: "weknora",
	normalize: normalizeWeKnoraConfig,
});

export function readWeKnoraConfig(): Promise<WeKnoraConfig> {
	return weKnoraConfigStore.read();
}

export function readWeKnoraConfigSync(): WeKnoraConfig {
	return weKnoraConfigStore.readSync();
}

/** 读-改-写：只覆盖 patch 里出现的字段。 */
export async function updateWeKnoraConfig(patch: WeKnoraConfigPatch): Promise<WeKnoraConfig> {
	const current = await weKnoraConfigStore.read();
	const next = normalizeWeKnoraConfig({ ...current, ...patch });
	await weKnoraConfigStore.write(next);
	return next;
}
