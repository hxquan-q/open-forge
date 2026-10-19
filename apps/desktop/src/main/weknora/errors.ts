// Copyright The Open Forge contributors.

import type { WeKnoraCapability, WeKnoraError, WeKnoraErrorCode } from "./types.js";

/** `TENANT_REQUIRED` 的判定标记；用平台 API Key 时 WeKnora 以 409 返回它（AC-21④）。 */
const TENANT_REQUIRED_TOKEN = "TENANT_REQUIRED";

/**
 * 携带归一化错误的异常，供 REST 调用方 `try/catch` 后读 `error.weknora`。
 *
 * `message` 只放错误码 —— 不拼中文（红线 C4）、不含凭据（红线 C2）。
 */
export class WeKnoraRequestError extends Error {
	readonly weknora: WeKnoraError;

	constructor(weknora: WeKnoraError) {
		super(weknora.code);
		this.name = "WeKnoraRequestError";
		this.weknora = weknora;
	}
}

/** 同一次请求内的错误去重器（T00·F3：一次失败可能连发两条相同 error）。 */
export interface WeKnoraErrorDeduplicator {
	/** 首次见到该错误码返回 true，重复返回 false。 */
	shouldReport(error: WeKnoraError): boolean;
}

export function createErrorDeduplicator(): WeKnoraErrorDeduplicator {
	const seen = new Set<WeKnoraErrorCode>();
	return {
		shouldReport(error) {
			if (seen.has(error.code)) return false;
			seen.add(error.code);
			return true;
		},
	};
}

export interface HttpErrorContext {
	/** 该请求所需的能力，用于在 403 时区分缺失的是 read_agents 还是 chat。 */
	capability?: WeKnoraCapability;
}

/** 把 HTTP 状态码归一化成稳定错误码。 */
export function normalizeHttpError(status: number, body: unknown, context?: HttpErrorContext): WeKnoraError {
	if (status === 401) return { code: "unauthorized", status };
	if (status === 403) {
		return context?.capability
			? { code: "capability_missing", status, missingCapability: context.capability }
			: { code: "capability_missing", status };
	}
	if (status === 409 && bodyContainsToken(body, TENANT_REQUIRED_TOKEN)) {
		return { code: "tenant_required", status };
	}
	const detail = describeBody(body);
	return detail ? { code: "unknown", status, detail } : { code: "unknown", status };
}

/**
 * 把 fetch / 读取过程抛出的异常归一化。
 *
 * `timedOut` 由调用方根据自身的超时控制器判定 —— 超时和外部取消都会让 fetch 抛 AbortError，
 * 只有控制器知道是哪种。
 */
export function normalizeThrownError(error: unknown, options: { timedOut: boolean }): WeKnoraError {
	if (options.timedOut) return { code: "timeout" };
	return { code: "network", detail: errorMessage(error) };
}

/** SSE 帧里 `response_type:"error"` 的归一化（AC-21⑥）。 */
export function normalizeStreamError(detail?: string): WeKnoraError {
	return detail ? { code: "stream_error", detail } : { code: "stream_error" };
}

/** 流自然结束但没收到 `complete`（AC-21⑦ / T00·F6）。 */
export function streamInterruptedError(): WeKnoraError {
	return { code: "stream_interrupted" };
}

function bodyContainsToken(body: unknown, token: string): boolean {
	if (typeof body === "string") return body.includes(token);
	if (body === undefined || body === null) return false;
	try {
		return JSON.stringify(body).includes(token);
	} catch {
		return false;
	}
}

/** 截断错误响应体，避免把整段 HTML 塞进 detail。 */
function describeBody(body: unknown): string | undefined {
	if (typeof body === "string") return body.slice(0, 500) || undefined;
	if (body === undefined || body === null) return undefined;
	try {
		return JSON.stringify(body).slice(0, 500);
	} catch {
		return undefined;
	}
}

function errorMessage(error: unknown): string | undefined {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return undefined;
}
