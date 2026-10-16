// Copyright The Open Forge contributors.

import type { CredentialRef } from "../credentials/credential-vault.js";
import { getDesktopCredentialVault } from "../credentials/desktop-credential-vault.js";

/**
 * 智能客服 API Key 的读写（红线 C2 / C8）。
 *
 * Key 只进 Electron safeStorage 凭据库，绝不落明文文件、不进日志、不回传渲染层——
 * 渲染层只通过 `hasApiKey` 布尔判断「已配置 / 未配置」。
 */
const API_KEY_REF: CredentialRef = { namespace: "weknora", ownerId: "default", name: "api-key" };

/** 是否存在 Key（只查记录，不解密）。 */
export function hasWeKnoraApiKey(): boolean {
	return getDesktopCredentialVault().has(API_KEY_REF);
}

/** 读出 Key 供主进程发起请求；调用方不得把它带出主进程。 */
export function readWeKnoraApiKey(): string | undefined {
	return getDesktopCredentialVault().get(API_KEY_REF);
}

export function writeWeKnoraApiKey(apiKey: string): void {
	getDesktopCredentialVault().put(API_KEY_REF, apiKey, { kind: "api-key", consumer: "weknora" });
}
