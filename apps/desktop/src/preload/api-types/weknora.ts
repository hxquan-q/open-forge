// Copyright The Open Forge contributors.

import type { WeKnoraConfigPatch } from "../../main/weknora/config.js";
import type {
	WeKnoraAskInput,
	WeKnoraAskResult,
	WeKnoraDeleteSessionInput,
	WeKnoraGetChunkInput,
	WeKnoraListParams,
	WeKnoraLoadMessagesInput,
	WeKnoraPublicConfig,
} from "../../main/weknora/service.js";
import type {
	WeKnoraAgent,
	WeKnoraChunk,
	WeKnoraMessage,
	WeKnoraSession,
	WeKnoraStreamEvent,
} from "../../main/weknora/types.js";

// 渲染进程按这份合同调用；类型定义留在主进程领域模块，不另建第二套事实源（红线 C8）。
export type {
	WeKnoraAgent,
	WeKnoraAskInput,
	WeKnoraAskResult,
	WeKnoraChunk,
	WeKnoraConfigPatch,
	WeKnoraDeleteSessionInput,
	WeKnoraGetChunkInput,
	WeKnoraListParams,
	WeKnoraLoadMessagesInput,
	WeKnoraMessage,
	WeKnoraPublicConfig,
	WeKnoraSession,
	WeKnoraStreamEvent,
};

/** 会话列表返回 T01 的 `WeKnoraSession`：绑定 agent 在 `last_request_state.agent_id`（AC-20）。 */
export type WeKnoraSessionSummary = WeKnoraSession;

export interface DesktopWeKnoraApi {
	/** 读配置；返回体只含 `hasApiKey` 布尔，**绝不含 Key**（红线 C2）。 */
	getConfig(): Promise<WeKnoraPublicConfig>;
	setConfig(patch: WeKnoraConfigPatch): Promise<void>;
	/** 只写不读：写入后不以任何形态回传。 */
	setApiKey(apiKey: string): Promise<void>;
	listAgents(params?: WeKnoraListParams): Promise<WeKnoraAgent[]>;
	listSessions(params?: WeKnoraListParams): Promise<WeKnoraSessionSummary[]>;
	loadMessages(input: WeKnoraLoadMessagesInput): Promise<WeKnoraMessage[]>;
	/**
	 * 删除会话（AC-8）：WeKnora 侧软删、无恢复入口（调用方负责确认与禁删判定）。
	 * 失败以归一化错误码的 `Error` 拒绝。
	 */
	deleteSession(input: WeKnoraDeleteSessionInput): Promise<void>;
	/**
	 * 取 chunk 原文（AC-14，只读）：GET `/api/v1/chunks/by-id/:id` 的归一化结果。
	 * 失败以归一化错误码的 `Error` 拒绝；缓存与重试策略在渲染层 chunkClient。
	 */
	getChunk(input: WeKnoraGetChunkInput): Promise<WeKnoraChunk>;
	/** 提问；`input.agentId` 为当前选中的智能体（AC-18 v5），缺省时回落到配置默认值。 */
	ask(input: WeKnoraAskInput): Promise<WeKnoraAskResult>;
	cancel(requestId: string): Promise<void>;
	/** 订阅主进程流事件（`vetta:weknora:stream-event`）；返回取消订阅函数。 */
	onStreamEvent(handler: (event: WeKnoraStreamEvent) => void): () => void;
}
