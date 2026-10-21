// Copyright The Open Forge contributors.

import type { WeKnoraStreamEvent } from "@preload/api";
import type { WeKnoraChatMessage } from "./atoms";
import { applyStreamEvent, isTerminalStreamEvent } from "./atoms";

/**
 * 后台思考引擎的纯函数路由层（02-plan §2.6，T01）。
 *
 * 状态本体在 atoms（`weKnoraStreamRoutesAtom` / `weKnoraSessionBuffersAtom`，模块级跨挂载存活）；
 * 本模块只做「给定状态 + 一条流事件 → 下一状态」的推导，**无 I/O、无 React**，是单测主战场
 * （R2：路由逻辑全部下沉纯函数，可穷举）。
 *
 * 模型要点：
 * - **归属表** `WeKnoraStreamRoutes`：requestId → 所属会话 id。事件按它路由，未知 requestId 一律丢弃
 *   （AC-15 防串台的收口；调用方还有一层「未决 ask 期暂存」见 useWeKnoraChat）。
 * - **每会话缓冲** `WeKnoraSessionBuffers`：键 = 会话 id，或草稿键 `draft:<token>`（会话尚未落库）。
 *   **缓冲条目的存在即「该会话有活跃流」**——AC-19 行级指示与 AC-10 禁删都从它派生；
 *   终态/取消/失败即释放（R6 内存有界），回看靠 openSession 重拉或直接用缓冲（AC-17）。
 */

/** 流归属表：requestId → 会话 id；`null` = 草稿期（ask 未落库，方案 §2.6 原始契约）。 */
export type WeKnoraStreamRoutes = Record<string, string | null>;

/** 每会话消息缓冲：键为会话 id 或 `draft:<token>`。仅活跃流留条目。 */
export type WeKnoraSessionBuffers = Record<string, WeKnoraChatMessage[]>;

/** 草稿缓冲键：token 在现行引擎里是「视图代次」（见 useWeKnoraChat 的 weKnoraViewSeqAtom）。 */
export function draftBufferKey(token: number | string): string {
	return `draft:${token}`;
}

/** 是否草稿键（`sessionIdsWithLiveStream` 据此把草稿排除在会话集合外）。 */
export function isDraftBufferKey(key: string): boolean {
	return key.startsWith("draft:");
}

/**
 * 归属表条目 → 缓冲键。`null`（草稿期）回落 `draft:<requestId>`：
 * 现行引擎在 ask 返回时已同时拿到 requestId 与真实 sessionId，注册的都是具体 id，
 * 生产路径不会以 `null` 注册；保留该分支只是让纯函数对契约全集完备（单测覆盖）。
 */
function bufferKeyOf(route: string | null, requestId: string): string {
	return route === null ? draftBufferKey(requestId) : route;
}

export interface RoutedStreamResult {
	readonly routes: WeKnoraStreamRoutes;
	readonly buffers: WeKnoraSessionBuffers;
	/** 是否命中已知路由；未命中（未知 requestId）时 routes/buffers 原引用返回，调用方直接丢弃。 */
	readonly matched: boolean;
	/** 命中时写入的缓冲键；未命中为 `null`。 */
	readonly bufferKey: string | null;
	/** 终态事件（turn.completed / turn.cancelled / turn.failed）的 requestId；非终态为 `null`。 */
	readonly terminalRequestId: string | null;
}

/**
 * 把一条流事件路由到所属会话的缓冲上。
 *
 * - 未知 requestId：**原引用返回**（不拷贝、不落地）——多路事件互不串台的收口（AC-15/AC-18）。
 * - 命中后复用 `applyStreamEvent` 的分区/终态语义（AC-25 思考切分、幂等终态都来自它）；
 *   无效果事件（如 `turn.started`）同样原引用传递，避免无谓重渲染。
 * - 终态：从归属表**注销**该 requestId。注意本函数**不释放缓冲**——终态内容（完整回答/失败标记）
 *   还在缓冲里，由调用方决定去向（当前会话拷进投影、后台会话触发列表重拉），随后调 `releaseBuffer`。
 */
export function routeStreamEvent(
	routes: WeKnoraStreamRoutes,
	buffers: WeKnoraSessionBuffers,
	event: WeKnoraStreamEvent,
): RoutedStreamResult {
	const route = routes[event.requestId];
	if (route === undefined) {
		return { routes, buffers, matched: false, bufferKey: null, terminalRequestId: null };
	}
	const key = bufferKeyOf(route, event.requestId);
	const current = buffers[key] ?? [];
	const next = applyStreamEvent(current, event, event.requestId);
	const nextBuffers = next === current ? buffers : { ...buffers, [key]: next };
	const terminalRequestId = isTerminalStreamEvent(event) ? event.requestId : null;
	return {
		routes: terminalRequestId === null ? routes : omitRoute(routes, terminalRequestId),
		buffers: nextBuffers,
		matched: true,
		bufferKey: key,
		terminalRequestId,
	};
}

/** 从归属表注销一个 requestId（取消 / 失败兜底路径用；终态在 `routeStreamEvent` 内已注销）。 */
export function omitRoute(routes: WeKnoraStreamRoutes, requestId: string): WeKnoraStreamRoutes {
	if (!(requestId in routes)) return routes;
	const next = { ...routes };
	delete next[requestId];
	return next;
}

/** 释放一个会话缓冲（终态副作用的一环，R6：仅活跃流留缓冲）。键不存在时原引用返回。 */
export function releaseBuffer(buffers: WeKnoraSessionBuffers, key: string): WeKnoraSessionBuffers {
	if (!(key in buffers)) return buffers;
	const next = { ...buffers };
	delete next[key];
	return next;
}

/**
 * 草稿迁移（假设 7）：`draft:<token>` 的缓冲改挂到真实 sessionId 键下。
 * 会话随 ask 落库而生，此后的事件与回切都走真实 id。
 */
export function migrateDraftBuffer(
	buffers: WeKnoraSessionBuffers,
	fromKey: string,
	toKey: string,
): WeKnoraSessionBuffers {
	if (fromKey === toKey || !(fromKey in buffers)) return buffers;
	const next = { ...buffers, [toKey]: buffers[fromKey] };
	delete next[fromKey];
	return next;
}

/** 反查：某会话当前活跃流的 requestId（UI 不变量下每会话至多一个；无则 `null`）。 */
export function findRequestIdForSession(routes: WeKnoraStreamRoutes, sessionId: string): string | null {
	for (const [requestId, route] of Object.entries(routes)) {
		if (route === sessionId) return requestId;
	}
	return null;
}

/** 有活跃流（含后台、含未决 ask）的会话 id 集合：AC-19 行级指示与 AC-10 禁删的判定源。 */
export function sessionIdsWithLiveStream(buffers: WeKnoraSessionBuffers): string[] {
	return Object.keys(buffers).filter((key) => !isDraftBufferKey(key));
}
