// Copyright The Open Forge contributors.

import type { WeKnoraErrorCode } from "../atoms";

/**
 * 错误码 → i18n key（主进程只产 code，中文在渲染层查表，红线 C4）。
 *
 * 从 `MessageBubble` 抽到 services 层的共享常量：消息失败态与批量删除失败明细都按错误码
 * 取同一套文案，避免两处各存一份（新增错误码只改这里一处）。
 */
export const WEKNORA_ERROR_KEYS = {
	not_configured: "error.not_configured",
	network: "error.network",
	unauthorized: "error.unauthorized",
	capability_missing: "error.capability_missing",
	tenant_required: "error.tenant_required",
	timeout: "error.timeout",
	stream_error: "error.stream_error",
	stream_interrupted: "error.stream_interrupted",
	unknown: "error.unknown",
} as const satisfies Record<WeKnoraErrorCode, string>;
