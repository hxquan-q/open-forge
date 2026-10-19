// Copyright The Open Forge contributors.

import { randomUUID } from "node:crypto";
import { readWeKnoraConfig, updateWeKnoraConfig, type WeKnoraConfig, type WeKnoraConfigPatch } from "./config.js";
import { hasWeKnoraApiKey, readWeKnoraApiKey, writeWeKnoraApiKey } from "./credentials.js";
import { WeKnoraRequestError } from "./errors.js";
import { WeKnoraHttpClient, type WeKnoraHttpClientOptions } from "./http.js";
import type { WeKnoraAgent, WeKnoraMessage, WeKnoraSession, WeKnoraStreamEvent } from "./types.js";

/** 单次问答超时（01-spec §3.6）：T00·F5 实测一次完整问答可达 420s，10 分钟留足余量。 */
const ASK_TIMEOUT_MS = 600_000;
/** 其它 REST 调用（建会话 / 列会话 / 列智能体 / 载消息）超时（01-spec §3.6）。 */
const REQUEST_TIMEOUT_MS = 30_000;

/** 暴露给渲染层的配置；**不含 API Key**（红线 C2）。 */
export interface WeKnoraPublicConfig {
	baseUrl: string;
	defaultAgentId: string;
	pageSize: number;
	/** UI 据此显示「已配置 / 未配置」；Key 本身永不出主进程。 */
	hasApiKey: boolean;
}

export interface WeKnoraListParams {
	page?: number;
	pageSize?: number;
}

export interface WeKnoraLoadMessagesInput {
	sessionId: string;
	limit?: number;
}

export interface WeKnoraDeleteSessionInput {
	/** 要删除的 WeKnora 会话 id（服务端按租户强制归属校验，删别人的删不到）。 */
	sessionId: string;
}

export interface WeKnoraAskInput {
	/** 为空则先建会话（AC-12）。 */
	sessionId?: string;
	query: string;
	/**
	 * 当前选中的智能体（AC-18 v5）。
	 *
	 * 显式传入时优先使用；缺省（`undefined`）才回落到 `config.defaultAgentId` —— 兜底是给
	 * 「渲染层漏传」留的安全网，不再是主进程隐式读全局配置。
	 */
	agentId?: string;
}

export interface WeKnoraAskResult {
	requestId: string;
	sessionId: string;
}

/**
 * 主进程侧的业务编排（02-plan §3.1）。
 *
 * IPC 层只做注册与入参校验；读配置、取凭据、调 HTTP、收敛流事件都在这里。
 * 依赖全部可注入，便于在不起 Electron、不发网络请求的前提下单测。
 */
export interface WeKnoraService {
	getConfig(): Promise<WeKnoraPublicConfig>;
	setConfig(patch: WeKnoraConfigPatch): Promise<void>;
	setApiKey(apiKey: string): void;
	listAgents(params?: WeKnoraListParams): Promise<WeKnoraAgent[]>;
	/** 返回 T01 的 `WeKnoraSession`（含 `last_request_state.agent_id`，供 AC-20 映射 agent 名）。 */
	listSessions(params?: WeKnoraListParams): Promise<WeKnoraSession[]>;
	loadMessages(input: WeKnoraLoadMessagesInput): Promise<WeKnoraMessage[]>;
	/** 删除会话（AC-8）：转调 HTTP 客户端；失败经 `WeKnoraRequestError` 归一化上抛。 */
	deleteSession(input: WeKnoraDeleteSessionInput): Promise<void>;
	ask(input: WeKnoraAskInput): Promise<WeKnoraAskResult>;
	cancel(requestId: string): void;
	onStreamEvent(handler: (event: WeKnoraStreamEvent) => void): () => void;
}

export interface WeKnoraServiceDependencies {
	readConfig?: () => Promise<WeKnoraConfig>;
	writeConfig?: (patch: WeKnoraConfigPatch) => Promise<WeKnoraConfig>;
	hasApiKey?: () => boolean;
	readApiKey?: () => string | undefined;
	writeApiKey?: (apiKey: string) => void;
	createClient?: (options: WeKnoraHttpClientOptions) => WeKnoraHttpClient;
	generateRequestId?: () => string;
}

export function createWeKnoraService(dependencies: WeKnoraServiceDependencies = {}): WeKnoraService {
	const readConfig = dependencies.readConfig ?? readWeKnoraConfig;
	const writeConfig = dependencies.writeConfig ?? updateWeKnoraConfig;
	const hasApiKey = dependencies.hasApiKey ?? hasWeKnoraApiKey;
	const readApiKey = dependencies.readApiKey ?? readWeKnoraApiKey;
	const writeApiKey = dependencies.writeApiKey ?? writeWeKnoraApiKey;
	const createClient = dependencies.createClient ?? ((options) => new WeKnoraHttpClient(options));
	const generateRequestId = dependencies.generateRequestId ?? (() => randomUUID());

	const streamHandlers = new Set<(event: WeKnoraStreamEvent) => void>();
	const activeRequests = new Map<string, AbortController>();

	const emit = (event: WeKnoraStreamEvent): void => {
		for (const handler of streamHandlers) handler(event);
	};

	/** 读配置 + 取凭据；任一缺失即 `not_configured`（AC-2）。 */
	const requireCredentials = async (): Promise<{ config: WeKnoraConfig; apiKey: string }> => {
		const config = await readConfig();
		const apiKey = readApiKey();
		if (!config.baseUrl.trim() || !apiKey) throw new WeKnoraRequestError({ code: "not_configured" });
		return { config, apiKey };
	};

	const restClient = async (): Promise<WeKnoraHttpClient> => {
		const { config, apiKey } = await requireCredentials();
		return createClient({ baseUrl: config.baseUrl, apiKey, timeoutMs: REQUEST_TIMEOUT_MS });
	};

	return {
		async getConfig() {
			const config = await readConfig();
			return {
				baseUrl: config.baseUrl,
				defaultAgentId: config.defaultAgentId,
				pageSize: config.pageSize,
				hasApiKey: hasApiKey(),
			};
		},

		async setConfig(patch) {
			await writeConfig(patch);
		},

		setApiKey(apiKey) {
			writeApiKey(apiKey);
		},

		async listAgents(params) {
			return (await restClient()).listAgents(params ?? {});
		},

		async listSessions(params) {
			return (await restClient()).listSessions(params ?? {});
		},

		async loadMessages({ sessionId, limit }) {
			return (await restClient()).loadMessages(sessionId, limit === undefined ? {} : { limit });
		},

		async deleteSession({ sessionId }) {
			await (await restClient()).deleteSession(sessionId);
		},

		async ask({ sessionId, query, agentId }) {
			const { config, apiKey } = await requireCredentials();
			const requestId = generateRequestId();
			const client = createClient({ baseUrl: config.baseUrl, apiKey, timeoutMs: ASK_TIMEOUT_MS });
			const resolvedSessionId = sessionId ?? (await client.createSession({})).id;
			const controller = new AbortController();
			activeRequests.set(requestId, controller);
			// 流式在后台推进，`ask` 立即返回 requestId 供渲染层做多路复用（AC-15）。
			void client
				.streamAgentChat({
					sessionId: resolvedSessionId,
					// AC-18 v5：显式传入的选中值优先；只有缺省时才回落到配置默认（渲染层漏传也不崩）。
					agentId: agentId ?? config.defaultAgentId,
					query,
					requestId,
					signal: controller.signal,
					onEvent: (event) => {
						emit(event);
						if (isTerminalStreamEvent(event)) activeRequests.delete(requestId);
					},
				})
				.catch(() => {
					// streamAgentChat 内部已把失败收敛成 turn.failed；此处只兜住意外异常，避免未处理的拒绝。
					activeRequests.delete(requestId);
				});
			return { requestId, sessionId: resolvedSessionId };
		},

		cancel(requestId) {
			activeRequests.get(requestId)?.abort();
		},

		onStreamEvent(handler) {
			streamHandlers.add(handler);
			return () => {
				streamHandlers.delete(handler);
			};
		},
	};
}

function isTerminalStreamEvent(event: WeKnoraStreamEvent): boolean {
	return event.type === "turn.completed" || event.type === "turn.cancelled" || event.type === "turn.failed";
}

let weKnoraService: WeKnoraService | undefined;

/** 进程内单例：注册 IPC 时用真实配置 / 凭据 / fetch。 */
export function getWeKnoraService(): WeKnoraService {
	weKnoraService ??= createWeKnoraService();
	return weKnoraService;
}
