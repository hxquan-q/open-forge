// Copyright The Open Forge contributors.

import type {
	WeKnoraAgent,
	WeKnoraMessage,
	WeKnoraPublicConfig,
	WeKnoraSession,
	WeKnoraStreamEvent,
} from "@preload/api";
import { atom } from "jotai";
import type { WeKnoraSessionBuffers, WeKnoraStreamRoutes } from "./weKnoraStreamStore";

/**
 * 「智能客服」页面的状态原子。
 *
 * 类型合同全部来自 preload（`@preload/api` 再导出主进程领域类型，红线 C8：不另建第二套事实源）。
 * 这里只放**页面内**的渲染状态；跨页面共享的状态才需要进 `shared/store`（本 feature 不需要）。
 */

export type WeKnoraChatRole = "user" | "assistant";

/** 单条消息的生命周期终态（AC-6 / AC-8 / AC-21⑦）。 */
export type WeKnoraMessageStatus = "streaming" | "complete" | "cancelled" | "interrupted" | "failed";

/** 智能体列表的加载状态；`empty` / `error` 对应 AC-19（不可提问）。 */
export type WeKnoraAgentsStatus = "idle" | "loading" | "ready" | "empty" | "error";

/** 历史会话列表的加载状态（AC-13）；空列表是合法结果，不单列 `empty`。 */
export type WeKnoraHistoryStatus = "idle" | "loading" | "ready" | "error";

/** 从流事件里取错误码联合，避免渲染层深链主进程模块（红线 C3）。 */
type WeKnoraFailedStreamEvent = Extract<WeKnoraStreamEvent, { type: "turn.failed" }>;
export type WeKnoraErrorCode = WeKnoraFailedStreamEvent["error"]["code"];

export interface WeKnoraChatMessage {
	readonly id: string;
	readonly role: WeKnoraChatRole;
	/**
	 * 正式回答正文（用户消息即提问）。流式期间先累积全文，终态由展示层做一次 Markdown 渲染（02-plan §4.4）。
	 */
	readonly text: string;
	/**
	 * 思考过程（AC-25）。流式期间为空：此时全文都还是「暂存」状态，由展示层按流式归入思考区；
	 * `answer.promoted` 到达后，`text` 的前缀被切到这里，`text` 只留正式回答。
	 */
	readonly thinking: string;
	readonly status: WeKnoraMessageStatus;
	readonly errorCode?: WeKnoraErrorCode;
	/** 仅用于排查的错误原文，不含凭据（红线 C2）。 */
	readonly errorDetail?: string;
}

export const weKnoraConfigAtom = atom<WeKnoraPublicConfig | null>(null);
export const weKnoraAgentsAtom = atom<WeKnoraAgent[]>([]);
export const weKnoraAgentsStatusAtom = atom<WeKnoraAgentsStatus>("idle");
export const weKnoraSelectedAgentIdAtom = atom<string | null>(null);
export const weKnoraMessagesAtom = atom<WeKnoraChatMessage[]>([]);
export const weKnoraSessionIdAtom = atom<string | null>(null);
export const weKnoraStreamingAtom = atom<boolean>(false);
export const weKnoraActiveRequestIdAtom = atom<string | null>(null);
/**
 * 流归属表（后台思考，02-plan §2.6）：requestId → 所属会话 id。
 *
 * 模块级跨挂载存活：切走页面 / 切换会话都不清（后台流照跑，AC-16）；
 * 终态 / 取消 / 失败即注销（见 weKnoraStreamStore）。
 */
export const weKnoraStreamRoutesAtom = atom<WeKnoraStreamRoutes>({});
/**
 * 每会话消息缓冲（后台思考）：键 = 会话 id 或草稿键 `draft:<视图代次>`。
 *
 * **条目存在即「该会话有活跃流」**——AC-19 行级指示、AC-10 禁删都从它派生；
 * 仅活跃流留条目，终态释放（R6 内存有界），回看走 openSession。
 */
export const weKnoraSessionBuffersAtom = atom<WeKnoraSessionBuffers>({});
/**
 * 视图代次：每次切换当前对话（新建 / 打开历史）自增。
 *
 * 用途：草稿期发起的 ask 还没有 sessionId，靠代次标记「属于哪个视图回合」——
 * ask 返回时若代次已变（用户切走了），该流按后台处理，不劫持新视图（防串台）。
 */
export const weKnoraViewSeqAtom = atom<number>(0);
/** 历史会话列表（从 WeKnora 读，本地不持久化，红线 C8）。 */
export const weKnoraSessionsAtom = atom<WeKnoraSession[]>([]);
export const weKnoraSessionsStatusAtom = atom<WeKnoraHistoryStatus>("idle");
/**
 * 保存配置失败的归一化错误码（④）；`null` = 无错误。`saveSetup` 写入、连接层读取并展示。
 *
 * 刻意**不进 view model**：② 要求 `useWeKnoraModel()` 的返回结构与 `WeKnoraViewModel` 保持原样，
 * 故失败反馈走独立 atom 由连接层（`WeKnoraPage`）读取，而不是给 view model 加字段。
 */
export const weKnoraSaveErrorAtom = atom<WeKnoraErrorCode | null>(null);

/** 流事件的终态（收到即结束本轮，AC-22 的收敛依据）。 */
export function isTerminalStreamEvent(event: WeKnoraStreamEvent): boolean {
	return event.type === "turn.completed" || event.type === "turn.cancelled" || event.type === "turn.failed";
}

function findStreamingAssistantIndex(messages: readonly WeKnoraChatMessage[]): number {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message && message.role === "assistant" && message.status === "streaming") return index;
	}
	return -1;
}

function replaceAt(messages: WeKnoraChatMessage[], index: number, next: WeKnoraChatMessage): WeKnoraChatMessage[] {
	return messages.map((message, current) => (current === index ? next : message));
}

/**
 * 把一条流事件落到消息列表上（纯函数，便于单测）。
 *
 * - `requestId` 不匹配即**原样返回同一个引用**：既保证多路复用不串台（AC-15），也让无变化的
 *   事件不触发重渲染。
 * - `answer.delta` 追加纯文本（不解析 Markdown，避免 R5 抖动）；`turn.completed` 才切终态，
 *   由展示层据此做一次完整 Markdown 渲染。
 * - `answer.promoted` 是 AC-25 的切分落点：把 `text` 的尾部 `promotedLength` 个字符留作正式回答，
 *   其余前缀切到 `thinking`（切分逻辑在解析层，此处只落库）。
 * - `turn.failed` 且错误码为 `stream_interrupted` 时标为 `interrupted`（AC-21⑦ 保留部分 + 未完成）。
 * - 重复的终态事件找不到仍在 streaming 的消息，天然幂等（AC-22）。
 */
export function applyStreamEvent(
	messages: WeKnoraChatMessage[],
	event: WeKnoraStreamEvent,
	activeRequestId: string | null,
): WeKnoraChatMessage[] {
	if (activeRequestId === null || event.requestId !== activeRequestId) return messages;
	const index = findStreamingAssistantIndex(messages);
	if (index < 0) return messages;
	const current = messages[index];
	if (!current) return messages;
	switch (event.type) {
		case "turn.started":
			return messages;
		case "answer.delta":
			return replaceAt(messages, index, { ...current, text: current.text + event.text });
		case "answer.promoted": {
			// 切分点由解析层给出：尾部 = 正式回答，前缀 = 思考（AC-25）。
			const answerLength = Math.min(event.promotedLength, current.text.length);
			const splitAt = current.text.length - answerLength;
			return replaceAt(messages, index, {
				...current,
				thinking: current.text.slice(0, splitAt),
				text: current.text.slice(splitAt),
			});
		}
		case "references":
			// T04/AC-9 未落地前，references 数据在此**直接丢弃**（`WeKnoraChatMessage` 暂无承载字段）。
			// 实现 AC-9 时需先给该类型加 `references` 字段，并在此落库。
			return messages;
		case "turn.completed":
			return replaceAt(messages, index, { ...current, status: "complete" });
		case "turn.cancelled":
			return replaceAt(messages, index, { ...current, status: "cancelled" });
		case "turn.failed": {
			const status: WeKnoraMessageStatus = event.error.code === "stream_interrupted" ? "interrupted" : "failed";
			return replaceAt(messages, index, {
				...current,
				status,
				errorCode: event.error.code,
				...(event.error.detail === undefined ? {} : { errorDetail: event.error.detail }),
			});
		}
		default:
			return messages;
	}
}

/**
 * 会话绑定的 agent id（AC-20）。
 *
 * `last_request_state` 整个缺失、或其中的 `agent_id` 缺失 / 非字符串，都返回 `null` —— **绝不抛**，
 * 由展示层显示「未知」。
 */
export function agentIdOfSession(session: WeKnoraSession): string | null {
	const id = session.last_request_state?.agent_id;
	return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * 会话绑定的 agent 名（AC-20）：由 `last_request_state.agent_id` 在 `agents` 里映射。
 * 映射不到返回 `null`（展示层显示「未知」），**不崩溃**。
 */
export function agentNameOfSession(agents: readonly WeKnoraAgent[], session: WeKnoraSession): string | null {
	const id = agentIdOfSession(session);
	if (id === null) return null;
	return agents.find((agent) => agent.id === id)?.name ?? null;
}

/** 会话的排序时间戳；`updated_at` 缺失时回落 `created_at`，都无效则为 0（保持相对顺序）。 */
function sessionTimestamp(session: WeKnoraSession): number {
	const value = session.updated_at ?? session.created_at;
	if (!value) return 0;
	const time = Date.parse(value);
	return Number.isNaN(time) ? 0 : time;
}

/** 按更新时间**倒序**（AC-13）；时间缺失时保持原相对顺序（`Array.prototype.sort` 稳定）。 */
export function sortSessionsByRecency(sessions: readonly WeKnoraSession[]): WeKnoraSession[] {
	return [...sessions].sort((a, b) => sessionTimestamp(b) - sessionTimestamp(a));
}

/**
 * 会话时间展示：本地时区，固定 `YYYY-MM-DD HH:mm`（不依赖 ICU 的本地化格式，测试可断言）。
 * 输入缺失 / 非法一律返回空串。
 */
export function formatSessionTime(value: string | undefined): string {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const pad = (part: number): string => String(part).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 把 WeKnora 载入的消息序列转成页面消息（AC-14）。
 *
 * 只保留 `user` / `assistant`（`system` 不参与对话渲染）；顺序沿用服务端返回的时间正序。
 */
export function toChatMessages(messages: readonly WeKnoraMessage[]): WeKnoraChatMessage[] {
	const result: WeKnoraChatMessage[] = [];
	for (const message of messages) {
		if (message.role !== "user" && message.role !== "assistant") continue;
		result.push({
			id: message.id,
			role: message.role,
			text: message.content,
			thinking: "",
			status: "complete",
		});
	}
	return result;
}
