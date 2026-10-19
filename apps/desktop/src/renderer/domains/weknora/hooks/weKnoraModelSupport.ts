// Copyright The Open Forge contributors.

import type { WeKnoraPublicConfig } from "@preload/api";
import type { WeKnoraErrorCode } from "../atoms";

/**
 * `useWeKnora*` 各 hook 共用的纯函数与常量。
 *
 * 不放状态（状态归各 hook 自己的 atom），只放「无副作用、可被多处复用」的判断与映射，
 * 避免每个 hook 各抄一份（红线 C8：不建第二套事实源）。
 */

/** 历史会话列表 / 载入消息的分页大小（用户 2026-10-16 裁定 1c：20；不做向上翻页，1e）。 */
export const HISTORY_PAGE_SIZE = 20;

/** 渲染层只认识主进程给的错误码；IPC 抛回的 Error.message 里带码，按码前缀提取。 */
const KNOWN_ERROR_CODES: readonly WeKnoraErrorCode[] = [
	"not_configured",
	"network",
	"unauthorized",
	"capability_missing",
	"tenant_required",
	"timeout",
	"stream_error",
	"stream_interrupted",
	"unknown",
];

export function errorCodeOf(error: unknown): WeKnoraErrorCode {
	const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
	return KNOWN_ERROR_CODES.find((code) => message.includes(code)) ?? "unknown";
}

/** 已配置 = 有非空 `baseUrl` 且有 API Key（AC-2：未配置时一个请求都不发）。 */
export function isConfigured(config: WeKnoraPublicConfig | null): boolean {
	return config !== null && config.baseUrl.trim().length > 0 && config.hasApiKey;
}
