// Copyright The Open Forge contributors.

import type { WeKnoraStreamEvent } from "@preload/api";
import type { createStore } from "jotai";
import {
	weKnoraActiveRequestIdAtom,
	weKnoraMessagesAtom,
	weKnoraSessionBuffersAtom,
	weKnoraSessionIdAtom,
	weKnoraStreamingAtom,
	weKnoraStreamRoutesAtom,
	weKnoraViewSeqAtom,
} from "./atoms";
import { draftBufferKey, migrateDraftBuffer, releaseBuffer, routeStreamEvent } from "./weKnoraStreamStore";

/**
 * 后台终态触发列表重拉的去抖窗口（AC-20）：多个后台流几乎同时完成时合并为一次
 * `loadSessions`，不做请求风暴。取「首个终态后等 500ms」的合并语义——窗口内后续
 * 终态看到已有排期即跳过，一轮突发只发一次请求。
 */
const BACKGROUND_RELOAD_DEBOUNCE_MS = 500;

/**
 * 引擎键控的 store 形状。jotai 的公开入口不导出 `Store` 类型（它藏在 vanilla 内部
 * 模块），以 `createStore` 的返回类型代之——与 `useStore()` 返回的是同一种对象。
 */
type WeKnoraAtomStore = ReturnType<typeof createStore>;

/** 单个 store 上的引擎私有状态（跨组件挂载存活，随 store 而非组件存亡）。 */
interface WeKnoraStreamEngineState {
	/** 未决 ask 数（跨会话可并发）：>0 时未知 requestId 的事件才暂存，否则丢弃。 */
	pendingAskCount: number;
	/** ask 已发出但 requestId 尚未回来：此间到达的流事件先暂存，避免丢掉首个分片。 */
	pendingEvents: WeKnoraStreamEvent[];
	/** 后台终态合并重拉的排期句柄；null = 无排期（AC-20）。 */
	reloadTimer: number | null;
	/** 最近一次挂载注册进来的 `loadSessions`：页面不在时终态也要静默刷新列表（AC-20）。 */
	reload: (() => Promise<void>) | null;
}

/**
 * 引擎登记表：store → 该 store 的引擎状态；**条目存在即「已订阅」**（订阅只建一次）。
 *
 * 按 store 键控的原因：状态本体（atoms）挂在 jotai store 上——生产 App 无自定义
 * Provider，`useStore()` 恒返回默认 store；测试每个用例 `createStore()` 注入 Provider。
 * 引擎必须写「视图正在读的那个 store」，故以 store 为单例键：同一 store 幂等
 * （挂载 N 次也只订阅一次），不同 store 各持一条订阅互不串台。WeakMap 让引擎状态
 * 随 store 一起可回收，不阻止 GC。
 */
const engines = new WeakMap<WeKnoraAtomStore, WeKnoraStreamEngineState>();

/** 当前对话的缓冲键（语义同 hook 内同名 helper）：已落库会话用 sessionId；草稿用当前视图代次的 draft 键。 */
function currentBufferKeyOf(store: WeKnoraAtomStore): string {
	const currentSession = store.get(weKnoraSessionIdAtom);
	return currentSession === null ? draftBufferKey(store.get(weKnoraViewSeqAtom)) : currentSession;
}

/**
 * 把一条流事件路由到所属会话的缓冲并落 atom（原 `useWeKnoraChat.handleEvent` 迁入，
 * 防御语义逐条保持，清单见 hook 头注释）。无论页面在不在都照常执行——这正是订阅
 * 常驻的意义：离开 /weknora 路由期间分片照常进缓冲、终态照常释放。
 */
function routeEvent(store: WeKnoraAtomStore, event: WeKnoraStreamEvent): void {
	const state = engines.get(store);
	if (state === undefined) return; // 订阅必经 ensure（先建状态），理论不可达；防御收口
	const result = routeStreamEvent(store.get(weKnoraStreamRoutesAtom), store.get(weKnoraSessionBuffersAtom), event);
	if (!result.matched) {
		// 未知 requestId：ask 未决（本请求的第一片）则暂存待回放；否则丢弃（迟到/串台事件）。
		if (state.pendingAskCount > 0) state.pendingEvents.push(event);
		return;
	}
	store.set(weKnoraStreamRoutesAtom, result.routes);
	store.set(weKnoraSessionBuffersAtom, result.buffers);
	const bufferKey = result.bufferKey;
	if (bufferKey === null) return;
	// 当前会话的缓冲变动 → 投影（视图永远只读投影 atom，「收编」的落点；页面不在时
	// 同样写，重挂即见）。终态同时清当前会话的流身份，页面不在也不会残留 isStreaming 假活。
	if (bufferKey === currentBufferKeyOf(store)) {
		store.set(weKnoraMessagesAtom, result.buffers[bufferKey] ?? []);
		if (result.terminalRequestId !== null) {
			store.set(weKnoraActiveRequestIdAtom, null);
			store.set(weKnoraStreamingAtom, false);
		}
	}
	if (result.terminalRequestId !== null) {
		// 终态释放缓冲（R6）：当前会话的终态内容已进投影；后台会话回看走 openSession 重拉。
		store.set(weKnoraSessionBuffersAtom, releaseBuffer(store.get(weKnoraSessionBuffersAtom), bufferKey));
		if (bufferKey !== currentBufferKeyOf(store)) scheduleBackgroundReload(store);
	}
}

/**
 * 后台终态 → 合并去抖后静默重拉会话列表（AC-20）。
 *
 * 定时器归引擎、**不随组件卸载清除**（与旧 hook 实现同寿命，但现在是有意为之）：
 * 页面不在时列表也要刷新；防重复排期由「已有排期即跳过」保证，一轮突发只排一次。
 */
function scheduleBackgroundReload(store: WeKnoraAtomStore): void {
	const state = engines.get(store);
	if (state === undefined || state.reloadTimer !== null) return;
	state.reloadTimer = window.setTimeout(() => {
		state.reloadTimer = null;
		if (state.reload !== null) void state.reload();
	}, BACKGROUND_RELOAD_DEBOUNCE_MS);
}

/**
 * 启动/接线模块级流引擎（幂等）：某 store 的首个挂载者建立对 `onStreamEvent` 的
 * **常驻订阅**，之后的任何挂载都只刷新 `loadSessions` 引用，不再订阅、永不退订。
 *
 * 为什么订阅必须常驻（模块级）而不能挂在组件 effect 的清理上：weknora 流事件在
 * 渲染层的订阅者唯有本引擎，而归属表/每会话缓冲是模块级 atom、设计上跨挂载存活
 * （02-plan §2.6）——订阅若随组件卸载退订，离开 /weknora 路由期间主进程照常转发
 * SSE、事件却在 preload 侧无人接收而全丢：流到终态则路由与缓冲永不释放（该会话
 * 永久「思考中」+ 永久禁删，AC-19/10），中途回切则卸载窗口内的分片永久丢失
 * （AC-17 中段空洞）。订阅与状态本体同生命周期（模块级）才自洽。
 */
export function ensureWeKnoraStreamEngine(store: WeKnoraAtomStore, loadSessions: () => Promise<void>): void {
	let state = engines.get(store);
	if (state === undefined) {
		state = { pendingAskCount: 0, pendingEvents: [], reloadTimer: null, reload: null };
		engines.set(store, state);
		// 返回的退订函数刻意丢弃：订阅生命周期 = 模块生命周期（见上）。
		window.vetta.weknora.onStreamEvent((event) => routeEvent(store, event));
	}
	state.reload = loadSessions;
}

/** ask 已发出（结果未回）：开启一个「未知 requestId 事件暂存」窗口（跨会话可并发）。 */
export function dispatchWeKnoraAsk(store: WeKnoraAtomStore): void {
	const state = engines.get(store);
	if (state !== undefined) state.pendingAskCount += 1;
}

/**
 * ask 成功落库：登记归属（requestId → sessionId）+ 草稿缓冲迁移到真实 sessionId
 * （假设 7），并收敛一个未决窗口计数。刻意**不含事件回放**：视图身份挂接
 * （草稿的 `setSessionId`）必须发生在回放之前，回放的首片才能按「当前会话缓冲」
 * 投影——顺序编排见 hook `send`。
 */
export function settleWeKnoraAskRoute(
	store: WeKnoraAtomStore,
	requestId: string,
	sessionId: string,
	originKey: string,
): void {
	const state = engines.get(store);
	if (state === undefined) return;
	state.pendingAskCount -= 1;
	store.set(weKnoraStreamRoutesAtom, (prev) => ({ ...prev, [requestId]: sessionId }));
	// originKey 是已落库会话 id 时 fromKey === toKey，migrateDraftBuffer 原引用返回，天然幂等。
	store.set(weKnoraSessionBuffersAtom, (prev) => migrateDraftBuffer(prev, originKey, sessionId));
}

/** ask 失败：收敛一个未决窗口；全部归零后清空暂存（没有流会再回放它们）。 */
export function failWeKnoraAsk(store: WeKnoraAtomStore): void {
	const state = engines.get(store);
	if (state === undefined) return;
	state.pendingAskCount -= 1;
	if (state.pendingAskCount === 0) state.pendingEvents = [];
}

/**
 * 回放未决窗口暂存的事件，只放行本请求的；其他未决 ask 的继续暂存（AC-18 并发）。
 * 回放走 `routeEvent` 同一条路径（此刻归属已注册，必命中）。
 */
export function replayWeKnoraPendingEvents(store: WeKnoraAtomStore, requestId: string): void {
	const state = engines.get(store);
	if (state === undefined) return;
	const buffered = state.pendingEvents;
	state.pendingEvents = [];
	const stillPending: WeKnoraStreamEvent[] = [];
	for (const event of buffered) {
		if (event.requestId === requestId) routeEvent(store, event);
		else stillPending.push(event);
	}
	state.pendingEvents = state.pendingAskCount > 0 ? stillPending : [];
}
