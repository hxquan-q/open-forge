// Copyright The Open Forge contributors.

/**
 * WeKnora 客户端层的类型合同。
 *
 * 所有外部边界（REST 响应 / SSE 帧）都先落到 `unknown`，再由 http.ts / sse.ts 收窄成本文件里的形状，
 * 因此这里描述的是「已归一化后的稳定形状」，不是 WeKnora 的原始 wire 结构。
 */

/** 会话消息角色。 */
export type WeKnoraMessageRole = "user" | "assistant" | "system";

/** 能力授权项（对应 API Key 的「能力授权」勾选项，见 01-spec §3.1）。 */
export type WeKnoraCapability = "read_agents" | "chat";

/** 会话最后一次请求的状态；`agent_id` 供历史列表映射 agent 名（AC-20）。 */
export interface WeKnoraSessionLastRequestState {
	agent_id?: string;
	agent_enabled?: boolean;
	[key: string]: unknown;
}

/** WeKnora 会话。 */
export interface WeKnoraSession {
	id: string;
	title?: string;
	description?: string;
	tenant_id?: string;
	user_id?: string;
	is_pinned?: boolean;
	created_at?: string;
	updated_at?: string;
	last_request_state?: WeKnoraSessionLastRequestState;
}

/** 知识引用条目；字段集未在 WeKnora 侧固定，保留索引签名以便渲染层按需读取。 */
export interface WeKnoraKnowledgeReference {
	id?: string;
	title?: string;
	url?: string;
	content?: string;
	[key: string]: unknown;
}

/** WeKnora 会话消息。 */
export interface WeKnoraMessage {
	id: string;
	session_id?: string;
	request_id?: string;
	role: WeKnoraMessageRole;
	content: string;
	knowledge_references?: WeKnoraKnowledgeReference[];
}

/** WeKnora 智能体（v4：列全部可见项，供选择器使用）。 */
export interface WeKnoraAgent {
	id: string;
	name: string;
	description?: string;
}

/**
 * 错误码（01-spec §4.2）。
 *
 * 主进程只产出 code，不拼中文文案 —— 文案在渲染层按 code 查 i18n（AC-21 / 红线 C4）。
 */
export type WeKnoraErrorCode =
	| "not_configured"
	| "network"
	| "unauthorized"
	| "capability_missing"
	| "tenant_required"
	| "timeout"
	| "stream_error"
	| "stream_interrupted"
	| "agent_list_empty"
	| "agent_mode_inactive"
	| "unknown";

/**
 * 归一化错误。
 *
 * `detail` 只承载原始错误信息用于排查，**绝不包含 API Key**（红线 C2）。
 */
export interface WeKnoraError {
	code: WeKnoraErrorCode;
	/** 触发该错误的 HTTP 状态码（网络 / 超时类错误没有）。 */
	status?: number;
	/** 仅 `capability_missing`：缺失的能力项。 */
	missingCapability?: WeKnoraCapability;
	/** 原始错误信息（不含凭据）。 */
	detail?: string;
}

/**
 * 主进程 → 渲染进程的增量流事件（02-plan §4.1）。
 *
 * `requestId` 用于多路复用：快速切换对话时不会把 A 的增量渲染到 B（AC-15）。
 *
 * ## 思考 / 正式回答的分区（AC-25）
 *
 * WeKnora 的旁白与正式回答走**同一种** `answer` 事件，类型上无法区分；区别只在位置 ——
 * 切分规则 = 「**最后一次 tool 活动之前的文本 = 思考；之后的 = 正式回答**」。
 *
 * 分片到达时无法预知后面是否还有工具活动，故切分点**由解析层在 `complete` 时给出**：
 * - `answer.delta` 形状保持不变：流式期间即时透传，**不缓冲**（`text` 先按「思考」暂存）。
 * - `answer.promoted` 在 `complete` 时发出，携带 `promotedLength` = 「最后一次 tool 活动之后」
 *   累积的字符数；渲染层据此把尾部该长度的文本从思考提升为正式回答。
 *
 * 退化情形：全程未调用任何工具 → `promotedLength` 即全文长度 → 全部提升为正式回答。
 */
export type WeKnoraStreamEvent =
	| { type: "turn.started"; requestId: string; sessionId: string }
	| { type: "answer.delta"; requestId: string; text: string }
	| { type: "answer.promoted"; requestId: string; promotedLength: number }
	| { type: "references"; requestId: string; refs: WeKnoraKnowledgeReference[] }
	| { type: "turn.completed"; requestId: string }
	| { type: "turn.cancelled"; requestId: string }
	| { type: "turn.failed"; requestId: string; error: WeKnoraError };
