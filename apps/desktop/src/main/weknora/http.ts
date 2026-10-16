// Copyright The Open Forge contributors.

import { normalizeHttpError, normalizeThrownError, WeKnoraRequestError } from "./errors.js";
import { createWeKnoraStreamParser } from "./sse.js";
import type {
	WeKnoraAgent,
	WeKnoraCapability,
	WeKnoraKnowledgeReference,
	WeKnoraMessage,
	WeKnoraMessageRole,
	WeKnoraSession,
	WeKnoraStreamEvent,
} from "./types.js";

/** 单次请求的默认超时（01-spec §3.6）。 */
export const DEFAULT_TIMEOUT_MS = 120_000;
/** agents / sessions 列表的默认分页大小（01-spec §3.6）。 */
export const DEFAULT_PAGE_SIZE = 50;

export interface WeKnoraHttpClientOptions {
	baseUrl: string;
	/** 租户 API Key；只作为入参传入，不落盘、不进日志（红线 C2）。 */
	apiKey: string;
	timeoutMs?: number;
	/** 便于测试注入；默认用全局 fetch。 */
	fetchImpl?: typeof fetch;
}

export interface StreamAgentChatInput {
	sessionId: string;
	agentId: string;
	query: string;
	/** 本次请求的 requestId，注入到每个流事件（多路复用，AC-15）。 */
	requestId: string;
	signal?: AbortSignal;
	onEvent: (event: WeKnoraStreamEvent) => void;
}

export interface ListParams {
	page?: number;
	pageSize?: number;
}

/**
 * WeKnora REST + SSE 客户端（主进程，无 UI、无凭据存取）。
 *
 * 错误统一走 `WeKnoraError`：REST 方法以 `WeKnoraRequestError` 抛出，流式方法以 `turn.failed` 事件收敛。
 */
export class WeKnoraHttpClient {
	private readonly baseUrl: string;
	private readonly apiKey: string;
	private readonly timeoutMs: number;
	private readonly fetchImpl: typeof fetch;

	constructor(options: WeKnoraHttpClientOptions) {
		this.baseUrl = options.baseUrl.replace(/\/+$/, "");
		this.apiKey = options.apiKey;
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
	}

	/** 新建 WeKnora 会话，返回 `data.id`（AC-4）。 */
	async createSession(input: { title?: string } = {}, signal?: AbortSignal): Promise<WeKnoraSession> {
		const body = await this.requestJson(
			"/api/v1/sessions",
			{ method: "POST", body: JSON.stringify(input.title ? { title: input.title } : {}) },
			signal,
			"chat",
		);
		const session = toSession(asRecord(body)?.data);
		if (!session) throw new WeKnoraRequestError({ code: "unknown", detail: "createSession: missing data.id" });
		return session;
	}

	/** 列出会话；v4 不带 `agent_id` 过滤（AC-13）。 */
	async listSessions(params: ListParams = {}, signal?: AbortSignal): Promise<WeKnoraSession[]> {
		const url = withQuery("/api/v1/sessions", {
			page: params.page ?? 1,
			page_size: params.pageSize ?? DEFAULT_PAGE_SIZE,
		});
		const body = await this.requestJson(url, { method: "GET" }, signal, "chat");
		return toArray(asRecord(body)?.data).map(toSession).filter(isDefined);
	}

	/** 载入某会话的消息序列（AC-14）。 */
	async loadMessages(
		sessionId: string,
		params: { limit?: number; beforeTime?: string } = {},
		signal?: AbortSignal,
	): Promise<WeKnoraMessage[]> {
		const url = withQuery(`/api/v1/messages/${encodeURIComponent(sessionId)}/load`, {
			limit: params.limit ?? DEFAULT_PAGE_SIZE,
			before_time: params.beforeTime,
		});
		const body = await this.requestJson(url, { method: "GET" }, signal, "chat");
		const raw = Array.isArray(body) ? body : asRecord(body)?.data;
		return toArray(raw).map(toMessage).filter(isDefined);
	}

	/** 列出该 Key 可见的全部智能体；**空列表是合法结果**（AC-16 / AC-19）。 */
	async listAgents(params: ListParams = {}, signal?: AbortSignal): Promise<WeKnoraAgent[]> {
		const url = withQuery("/api/v1/agents", {
			page: params.page ?? 1,
			page_size: params.pageSize ?? DEFAULT_PAGE_SIZE,
		});
		const body = await this.requestJson(url, { method: "GET" }, signal, "read_agents");
		return toArray(asRecord(body)?.data).map(toAgent).filter(isDefined);
	}

	/**
	 * 发起 agent 问答并**增量**解析 SSE 流（AC-6）。
	 *
	 * 不抛错：所有失败都通过 `turn.failed` 事件收敛；外部 `signal` 触发时收敛为 `turn.cancelled`。
	 */
	async streamAgentChat(input: StreamAgentChatInput): Promise<void> {
		const { requestId, onEvent, signal } = input;
		const parser = createWeKnoraStreamParser({ requestId, sessionId: input.sessionId });
		const guard = createTimeoutGuard(signal, this.timeoutMs);
		try {
			const response = await this.fetchImpl(
				this.absolute(`/api/v1/agent-chat/${encodeURIComponent(input.sessionId)}`),
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "text/event-stream",
						"X-API-Key": this.apiKey,
					},
					body: JSON.stringify({ query: input.query, agent_id: input.agentId, channel: "api" }),
					signal: guard.signal,
				},
			);
			if (!response.ok) {
				// 非 2xx 时 body 是错误响应体（非 SSE），可以整段读；成功路径必须走 getReader 增量解析。
				const text = await response.text();
				onEvent({
					type: "turn.failed",
					requestId,
					error: normalizeHttpError(response.status, parseJson(text) ?? text, { capability: "chat" }),
				});
				return;
			}
			const body = response.body;
			if (!body) {
				for (const event of parser.finish()) onEvent(event);
				return;
			}
			const reader = body.getReader();
			try {
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					if (!value) continue;
					for (const event of parser.push(value)) onEvent(event);
				}
			} finally {
				reader.releaseLock();
			}
			for (const event of parser.finish()) onEvent(event);
		} catch (error) {
			if (signal?.aborted) {
				onEvent({ type: "turn.cancelled", requestId });
				return;
			}
			onEvent({
				type: "turn.failed",
				requestId,
				error: normalizeThrownError(error, { timedOut: guard.timedOut() }),
			});
		} finally {
			guard.dispose();
		}
	}

	private absolute(path: string): string {
		return `${this.baseUrl}${path}`;
	}

	private async requestJson(
		path: string,
		init: RequestInit,
		signal: AbortSignal | undefined,
		capability: WeKnoraCapability,
	): Promise<unknown> {
		const guard = createTimeoutGuard(signal, this.timeoutMs);
		try {
			const response = await this.fetchImpl(this.absolute(path), {
				...init,
				headers: { "Content-Type": "application/json", "X-API-Key": this.apiKey },
				signal: guard.signal,
			});
			const text = await response.text();
			const parsed = parseJson(text);
			if (!response.ok) {
				throw new WeKnoraRequestError(normalizeHttpError(response.status, parsed ?? text, { capability }));
			}
			return parsed;
		} catch (error) {
			if (error instanceof WeKnoraRequestError) throw error;
			throw new WeKnoraRequestError(normalizeThrownError(error, { timedOut: guard.timedOut() }));
		} finally {
			guard.dispose();
		}
	}
}

interface TimeoutGuard {
	signal: AbortSignal;
	timedOut(): boolean;
	dispose(): void;
}

/**
 * 合并「外部取消」与「超时」两种中止来源，并保留是哪种触发的判定。
 *
 * fetch 抛出的 AbortError 不区分来源，只有控制器自己知道 —— 外部取消要收敛成 `turn.cancelled`，
 * 超时则要收敛成 `timeout`。
 */
function createTimeoutGuard(external: AbortSignal | undefined, timeoutMs: number): TimeoutGuard {
	const controller = new AbortController();
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutMs);
	const onAbort = () => controller.abort();
	if (external) {
		if (external.aborted) controller.abort();
		else external.addEventListener("abort", onAbort, { once: true });
	}
	return {
		signal: controller.signal,
		timedOut: () => timedOut,
		dispose: () => {
			clearTimeout(timer);
			external?.removeEventListener("abort", onAbort);
		},
	};
}

function withQuery(path: string, params: Record<string, string | number | undefined>): string {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined) search.set(key, String(value));
	}
	const query = search.toString();
	return query ? `${path}?${query}` : path;
}

function parseJson(text: string): unknown {
	if (!text) return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

function toSession(raw: unknown): WeKnoraSession | undefined {
	const record = asRecord(raw);
	const id = record ? asString(record.id) : undefined;
	if (!record || !id) return undefined;
	return {
		id,
		title: asString(record.title),
		description: asString(record.description),
		tenant_id: asString(record.tenant_id),
		user_id: asString(record.user_id),
		is_pinned: typeof record.is_pinned === "boolean" ? record.is_pinned : undefined,
		created_at: asString(record.created_at),
		updated_at: asString(record.updated_at),
		last_request_state: asRecord(record.last_request_state) as WeKnoraSession["last_request_state"],
	};
}

function toMessage(raw: unknown): WeKnoraMessage | undefined {
	const record = asRecord(raw);
	if (!record) return undefined;
	const id = asString(record.id);
	const content = asString(record.content);
	if (id === undefined && content === undefined) return undefined;
	return {
		id: id ?? "",
		session_id: asString(record.session_id),
		request_id: asString(record.request_id),
		role: toRole(record.role),
		content: content ?? "",
		knowledge_references: toReferences(record.knowledge_references),
	};
}

function toAgent(raw: unknown): WeKnoraAgent | undefined {
	const record = asRecord(raw);
	const id = record ? asString(record.id) : undefined;
	if (!record || !id) return undefined;
	return { id, name: asString(record.name) ?? "", description: asString(record.description) };
}

function toReferences(raw: unknown): WeKnoraKnowledgeReference[] | undefined {
	if (!Array.isArray(raw)) return undefined;
	const refs: WeKnoraKnowledgeReference[] = [];
	for (const item of raw) {
		const record = asRecord(item);
		if (record) refs.push(record as WeKnoraKnowledgeReference);
	}
	return refs.length > 0 ? refs : undefined;
}

function toRole(raw: unknown): WeKnoraMessageRole {
	return raw === "user" || raw === "assistant" || raw === "system" ? raw : "assistant";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function toArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function isDefined<T>(value: T | undefined): value is T {
	return value !== undefined;
}
