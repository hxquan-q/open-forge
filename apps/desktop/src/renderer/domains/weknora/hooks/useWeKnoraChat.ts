// Copyright The Open Forge contributors.

import type { WeKnoraAgent, WeKnoraPublicConfig, WeKnoraStreamEvent } from "@preload/api";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import {
	applyStreamEvent,
	isTerminalStreamEvent,
	type WeKnoraAgentsStatus,
	type WeKnoraChatMessage,
	weKnoraActiveRequestIdAtom,
	weKnoraMessagesAtom,
	weKnoraSessionIdAtom,
	weKnoraStreamingAtom,
} from "../atoms";
import { errorCodeOf, isConfigured } from "./weKnoraModelSupport";

export interface WeKnoraChatDeps {
	readonly config: WeKnoraPublicConfig | null;
	readonly agents: readonly WeKnoraAgent[];
	readonly agentsStatus: WeKnoraAgentsStatus;
	readonly selectedAgentId: string | null;
	/** 新建会话成功后刷新历史列表（缺陷 2：仅新建时刷新，追问复用会话不重复拉）。 */
	readonly loadSessions: () => Promise<void>;
	/** 载入历史会话的消息（AC-14）。 */
	readonly fetchMessages: (sessionId: string) => Promise<WeKnoraChatMessage[] | null>;
}

export interface WeKnoraChatState {
	readonly messages: readonly WeKnoraChatMessage[];
	/** 当前对话绑定的 WeKnora 会话 id；`null` = 「新对话，尚未建会话」（AC-11/12）。 */
	readonly sessionId: string | null;
	readonly isStreaming: boolean;
	/** 允许提问：已配置 + 有可用智能体 + 无进行中的回答（AC-7 / AC-19）。 */
	readonly canAsk: boolean;
	readonly send: (text: string) => void;
	readonly cancel: () => void;
	/** 新建对话：清空当前会话与消息，**不立即建会话**（AC-12）。 */
	readonly newConversation: () => void;
	/** 载入历史会话并恢复为当前对话，之后追问接上（AC-14）。 */
	readonly openSession: (sessionId: string) => Promise<void>;
}

/**
 * 对话 actor：消息、当前会话、流式状态，以及发送 / 取消 / 新建 / 载入。
 *
 * 流事件按 `requestId` 过滤，防串台（AC-15）。当前请求身份存 atom（跨实例存活），
 * 并以它的值给 ref 起步，保证重挂后仍可取消（① / AC-8 / AC-22）。
 */
export function useWeKnoraChat(deps: WeKnoraChatDeps): WeKnoraChatState {
	const { config, agents, agentsStatus, selectedAgentId, loadSessions, fetchMessages } = deps;
	const [messages, setMessages] = useAtom(weKnoraMessagesAtom);
	const [sessionId, setSessionId] = useAtom(weKnoraSessionIdAtom);
	const [isStreaming, setIsStreaming] = useAtom(weKnoraStreamingAtom);
	const [activeRequestId, setActiveRequestId] = useAtom(weKnoraActiveRequestIdAtom);

	/**
	 * 当前请求身份。**以 atom 的值做 ref 初值** —— 二者生命周期必须一致（①）：
	 * `weKnoraActiveRequestIdAtom` 是模块级的，跨组件实例存活；若 ref 从 `null` 起步，
	 * 长回答进行中切走路由再切回时，atom 里还有 requestId 而 ref 已归 null，就会退化成
	 * 「isStreaming=true 却没有任何东西可取消它」（cancel 空转、canAsk 恒 false、消息永停 streaming）。
	 * 用 atom 初值恢复 ref，重挂后仍能取消 / 继续接收该流的事件。
	 */
	const activeRequestIdRef = useRef<string | null>(activeRequestId);
	/** `ask` 已发出但 requestId 尚未回来：此间到达的流事件先缓冲，避免丢掉首个分片。 */
	const isAskingRef = useRef(false);
	const pendingEventsRef = useRef<WeKnoraStreamEvent[]>([]);
	const messageCounterRef = useRef(0);

	const handleEvent = useCallback(
		(event: WeKnoraStreamEvent) => {
			const requestId = activeRequestIdRef.current;
			if (requestId === null || event.requestId !== requestId) return;
			setMessages((prev) => applyStreamEvent(prev, event, requestId));
			if (isTerminalStreamEvent(event)) {
				activeRequestIdRef.current = null;
				isAskingRef.current = false;
				pendingEventsRef.current = [];
				setActiveRequestId(null);
				setIsStreaming(false);
			}
		},
		[setActiveRequestId, setIsStreaming, setMessages],
	);

	useEffect(() => {
		const unsubscribe = window.vetta.weknora.onStreamEvent((event) => {
			if (activeRequestIdRef.current === null) {
				if (isAskingRef.current) pendingEventsRef.current.push(event);
				return;
			}
			handleEvent(event);
		});
		return unsubscribe;
	}, [handleEvent]);

	/**
	 * 挂载时收敛「有流式标记、却没有任何请求可取消」的残留状态（① / AC-22 / AC-8）。
	 *
	 * ref 已按 atom 恢复（见 `activeRequestIdRef` 初值），因此**有 requestId 的残留流**会照常继续、
	 * 仍可取消；本效果只兜住更窄的窗口 —— `isStreaming` 为真但连 requestId 都没有（例如 `ask`
	 * 尚未返回就切走路由）。那种状态下取消无从下手，绝不能把「转圈」留在界面上：直接收敛成确定终态。
	 */
	// biome-ignore lint/correctness/useExhaustiveDependencies: 只在挂载时对残留状态收敛一次，之后由 send / cancel / 终态事件驱动
	useEffect(() => {
		if (isStreaming && activeRequestIdRef.current === null) {
			setIsStreaming(false);
			setMessages((prev) =>
				prev.map((message) => (message.status === "streaming" ? { ...message, status: "interrupted" } : message)),
			);
		}
	}, []);

	const send = useCallback(
		async (text: string) => {
			const query = text.trim();
			const canAsk = isConfigured(config) && agentsStatus === "ready" && agents.length > 0 && !isStreaming;
			if (!query || !canAsk) return;
			messageCounterRef.current += 1;
			const userMessage: WeKnoraChatMessage = {
				id: `u${messageCounterRef.current}`,
				role: "user",
				text: query,
				thinking: "",
				status: "complete",
			};
			messageCounterRef.current += 1;
			const assistantId = `a${messageCounterRef.current}`;
			const assistantMessage: WeKnoraChatMessage = {
				id: assistantId,
				role: "assistant",
				text: "",
				thinking: "",
				status: "streaming",
			};
			setMessages((prev) => [...prev, userMessage, assistantMessage]);
			setIsStreaming(true);
			isAskingRef.current = true;
			// 本次是否新建 WeKnora 会话（缺陷 2：新建成功后才刷新历史，追问复用会话不重复拉）。
			const isNewSession = sessionId === null;
			try {
				const result = await window.vetta.weknora.ask({
					...(sessionId === null ? {} : { sessionId }),
					// AC-18 v5：把当前选中的智能体显式传下去，不再让主进程隐式读全局配置。
					...(selectedAgentId === null ? {} : { agentId: selectedAgentId }),
					query,
				});
				activeRequestIdRef.current = result.requestId;
				setActiveRequestId(result.requestId);
				setSessionId(result.sessionId);
				// 缺陷 2（实机反馈）：新会话刚落库，左栏应立刻出现，无需手动刷新页面。
				if (isNewSession) void loadSessions();
				isAskingRef.current = false;
				const buffered = pendingEventsRef.current;
				pendingEventsRef.current = [];
				for (const event of buffered) {
					if (event.requestId === result.requestId) handleEvent(event);
				}
			} catch (error) {
				isAskingRef.current = false;
				pendingEventsRef.current = [];
				activeRequestIdRef.current = null;
				setActiveRequestId(null);
				setIsStreaming(false);
				setMessages((prev) =>
					prev.map((message) =>
						message.id === assistantId
							? { ...message, status: "failed", errorCode: errorCodeOf(error) }
							: message,
					),
				);
			}
		},
		[
			agents.length,
			agentsStatus,
			config,
			handleEvent,
			isStreaming,
			loadSessions,
			sessionId,
			selectedAgentId,
			setActiveRequestId,
			setIsStreaming,
			setMessages,
			setSessionId,
		],
	);

	const cancel = useCallback(() => {
		const requestId = activeRequestIdRef.current;
		if (requestId === null) return;
		activeRequestIdRef.current = null;
		isAskingRef.current = false;
		pendingEventsRef.current = [];
		setActiveRequestId(null);
		setIsStreaming(false);
		// 保留已收到的部分文本，仅把状态标为「已取消」（AC-8）；main 侧也会发 turn.cancelled 收敛。
		setMessages((prev) =>
			prev.map((message) => (message.status === "streaming" ? { ...message, status: "cancelled" } : message)),
		);
		void window.vetta.weknora.cancel(requestId);
	}, [setActiveRequestId, setIsStreaming, setMessages]);

	/** 收敛进行中的流：清 requestId 后，旧流的事件会被 `requestId` 过滤丢弃（AC-15）。 */
	const resetActiveRequest = useCallback(() => {
		activeRequestIdRef.current = null;
		isAskingRef.current = false;
		pendingEventsRef.current = [];
		setActiveRequestId(null);
		setIsStreaming(false);
	}, [setActiveRequestId, setIsStreaming]);

	const newConversation = useCallback(() => {
		resetActiveRequest();
		setSessionId(null);
		setMessages([]);
	}, [resetActiveRequest, setMessages, setSessionId]);

	const openSession = useCallback(
		async (targetSessionId: string) => {
			const loaded = await fetchMessages(targetSessionId);
			// 失败：不切换、不崩溃（失败收口是 T06 范围）。成功：先收敛旧流再整体替换（AC-14 / AC-15）。
			if (loaded === null) return;
			resetActiveRequest();
			setSessionId(targetSessionId);
			setMessages(loaded);
		},
		[fetchMessages, resetActiveRequest, setMessages, setSessionId],
	);

	return {
		messages,
		sessionId,
		isStreaming,
		canAsk: isConfigured(config) && agentsStatus === "ready" && agents.length > 0 && !isStreaming,
		send,
		cancel,
		newConversation,
		openSession,
	};
}
