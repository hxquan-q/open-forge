// Copyright The Open Forge contributors.

import type {
	WeKnoraAgent,
	WeKnoraConfigPatch,
	WeKnoraPublicConfig,
	WeKnoraSession,
	WeKnoraStreamEvent,
} from "@preload/api";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	applyStreamEvent,
	isTerminalStreamEvent,
	sortSessionsByRecency,
	toChatMessages,
	type WeKnoraAgentsStatus,
	type WeKnoraChatMessage,
	type WeKnoraErrorCode,
	type WeKnoraHistoryStatus,
	weKnoraActiveRequestIdAtom,
	weKnoraAgentsAtom,
	weKnoraAgentsStatusAtom,
	weKnoraConfigAtom,
	weKnoraMessagesAtom,
	weKnoraSelectedAgentIdAtom,
	weKnoraSessionIdAtom,
	weKnoraSessionsAtom,
	weKnoraSessionsStatusAtom,
	weKnoraStreamingAtom,
} from "../atoms";

/** 历史会话列表 / 载入消息的分页大小（用户 2026-10-16 裁定 1c：20；不做向上翻页，1e）。 */
const HISTORY_PAGE_SIZE = 20;

export interface WeKnoraSetupInput {
	readonly baseUrl: string;
	readonly apiKey?: string;
}

export interface WeKnoraModelActions {
	/** 切换当前选中的智能体；持久化到配置（`set-config({defaultAgentId})`），下一条消息即生效（AC-17/18）。 */
	readonly selectAgent: (agentId: string) => void;
	readonly send: (text: string) => void;
	readonly cancel: () => void;
	/** 保存服务地址与 API Key；Key 只写不读（红线 C2）。 */
	readonly saveSetup: (input: WeKnoraSetupInput) => Promise<void>;
	readonly reloadAgents: () => void;
	/** 新建对话：清空当前会话与消息，**不立即建会话**（AC-12）。 */
	readonly newConversation: () => void;
	/** 重新拉取历史会话列表（AC-13）。 */
	readonly reloadSessions: () => void;
	/** 载入历史会话的消息并恢复为当前对话，之后追问接上（AC-14）。 */
	readonly openSession: (sessionId: string) => Promise<void>;
}

export interface WeKnoraViewModel {
	readonly configured: boolean;
	readonly config: WeKnoraPublicConfig | null;
	readonly agents: readonly WeKnoraAgent[];
	readonly agentsStatus: WeKnoraAgentsStatus;
	readonly selectedAgentId: string | null;
	readonly messages: readonly WeKnoraChatMessage[];
	readonly isStreaming: boolean;
	/** 当前对话绑定的 WeKnora 会话 id；`null` 表示「新对话，尚未建会话」（AC-11/12）。 */
	readonly currentSessionId: string | null;
	readonly sessions: readonly WeKnoraSession[];
	readonly sessionsStatus: WeKnoraHistoryStatus;
	/** 正在载入的历史会话 id（用于列表行 loading 态）。 */
	readonly loadingSessionId: string | null;
	/** 允许提问：已配置 + 有可用智能体 + 无进行中的回答（AC-7 / AC-19）。 */
	readonly canAsk: boolean;
	readonly saving: boolean;
	readonly actions: WeKnoraModelActions;
}

/** 渲染层只认识主进程给的错误码；IPC 抛回的 Error.message 里带码，按码前缀提取。 */
const KNOWN_ERROR_CODES: readonly WeKnoraErrorCode[] = [
	"not_configured",
	"network",
	"unauthorized",
	"capability_missing",
	"tenant_required",
	"timeout",
	"stream_error",
	"stream_interrupted",
	"agent_list_empty",
	"agent_mode_inactive",
	"unknown",
];

function errorCodeOf(error: unknown): WeKnoraErrorCode {
	const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
	return KNOWN_ERROR_CODES.find((code) => message.includes(code)) ?? "unknown";
}

function isConfigured(config: WeKnoraPublicConfig | null): boolean {
	return config !== null && config.baseUrl.trim().length > 0 && config.hasApiKey;
}

/**
 * 「智能客服」的视图模型（连接层逻辑）。
 *
 * 只经 `window.vetta.weknora` 的 IPC 合同与主进程交互，不直接触网（红线 C3）；
 * 未配置时**一个网络请求都不发**（AC-2 / AC-19）。流事件按 `requestId` 过滤，防串台（AC-15）。
 */
export function useWeKnoraModel(): WeKnoraViewModel {
	const [config, setConfig] = useAtom(weKnoraConfigAtom);
	const [agents, setAgents] = useAtom(weKnoraAgentsAtom);
	const [agentsStatus, setAgentsStatus] = useAtom(weKnoraAgentsStatusAtom);
	const [selectedAgentId, setSelectedAgentId] = useAtom(weKnoraSelectedAgentIdAtom);
	const [messages, setMessages] = useAtom(weKnoraMessagesAtom);
	const [sessionId, setSessionId] = useAtom(weKnoraSessionIdAtom);
	const [isStreaming, setIsStreaming] = useAtom(weKnoraStreamingAtom);
	const [, setActiveRequestId] = useAtom(weKnoraActiveRequestIdAtom);
	const [sessions, setSessions] = useAtom(weKnoraSessionsAtom);
	const [sessionsStatus, setSessionsStatus] = useAtom(weKnoraSessionsStatusAtom);
	const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	const activeRequestIdRef = useRef<string | null>(null);
	/** `ask` 已发出但 requestId 尚未回来：此间到达的流事件先缓冲，避免丢掉首个分片。 */
	const isAskingRef = useRef(false);
	const pendingEventsRef = useRef<WeKnoraStreamEvent[]>([]);
	const messageCounterRef = useRef(0);

	const loadAgents = useCallback(
		async (cfg: WeKnoraPublicConfig) => {
			setAgentsStatus("loading");
			try {
				const list = await window.vetta.weknora.listAgents({ page: 1, pageSize: cfg.pageSize });
				setAgents(list);
				if (list.length === 0) {
					setAgentsStatus("empty");
					setSelectedAgentId(null);
					return;
				}
				setAgentsStatus("ready");
				setSelectedAgentId((current) => {
					if (current !== null && list.some((agent) => agent.id === current)) return current;
					if (list.some((agent) => agent.id === cfg.defaultAgentId)) return cfg.defaultAgentId;
					return list[0]?.id ?? null;
				});
			} catch {
				setAgents([]);
				setAgentsStatus("error");
				setSelectedAgentId(null);
			}
		},
		[setAgents, setAgentsStatus, setSelectedAgentId],
	);

	/** 拉取历史会话列表（AC-13）：**不带 `agent_id` 过滤**（v4），固定分页 20（1c），按更新时间倒序。 */
	const loadSessions = useCallback(async () => {
		setSessionsStatus("loading");
		try {
			const list = await window.vetta.weknora.listSessions({ page: 1, pageSize: HISTORY_PAGE_SIZE });
			setSessions(sortSessionsByRecency(list));
			setSessionsStatus("ready");
		} catch {
			setSessions([]);
			setSessionsStatus("error");
		}
	}, [setSessions, setSessionsStatus]);

	// 初始化：读配置；已配置才拉智能体列表 + 历史会话（未配置绝不发请求，AC-2）。
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const cfg = await window.vetta.weknora.getConfig();
				if (cancelled) return;
				setConfig(cfg);
				if (isConfigured(cfg)) {
					await loadAgents(cfg);
					await loadSessions();
				} else {
					setAgentsStatus("idle");
				}
			} catch {
				if (!cancelled) setAgentsStatus("idle");
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [loadAgents, loadSessions, setConfig, setAgentsStatus]);

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

	const selectAgent = useCallback(
		(agentId: string) => {
			setSelectedAgentId(agentId);
			// 持久化「当前选中」以便再次进入仍记得（AC-17）；提问时再把选中值显式传给 ask（AC-18 v5）。
			void window.vetta.weknora.setConfig({ defaultAgentId: agentId });
		},
		[setSelectedAgentId],
	);

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

	/** 新建对话（AC-12）：清空当前会话与消息，**不立即调建会话接口** —— 等首次提问时才建。 */
	const newConversation = useCallback(() => {
		resetActiveRequest();
		setSessionId(null);
		setMessages([]);
	}, [resetActiveRequest, setMessages, setSessionId]);

	/** 载入历史会话（AC-14）：拉消息 → 恢复为当前对话（后续追问接上该 `session_id`）。 */
	const openSession = useCallback(
		async (targetSessionId: string) => {
			setLoadingSessionId(targetSessionId);
			try {
				const loaded = await window.vetta.weknora.loadMessages({
					sessionId: targetSessionId,
					limit: HISTORY_PAGE_SIZE,
				});
				// 先收敛进行中的流，再整体替换消息，避免旧流串到新对话（AC-15）。
				resetActiveRequest();
				setSessionId(targetSessionId);
				setMessages(toChatMessages(loaded));
			} catch {
				// 失败收口（错误文案 / 终态）是 T06 的范围；此处不切换、不崩溃。
			} finally {
				setLoadingSessionId(null);
			}
		},
		[resetActiveRequest, setMessages, setSessionId],
	);

	const reloadSessions = useCallback(() => {
		if (config) void loadSessions();
	}, [config, loadSessions]);

	const saveSetup = useCallback(
		async (input: WeKnoraSetupInput) => {
			setSaving(true);
			try {
				const patch: WeKnoraConfigPatch = { baseUrl: input.baseUrl.trim() };
				await window.vetta.weknora.setConfig(patch);
				const apiKey = input.apiKey?.trim();
				if (apiKey) await window.vetta.weknora.setApiKey(apiKey);
				const cfg = await window.vetta.weknora.getConfig();
				setConfig(cfg);
				if (isConfigured(cfg)) await loadAgents(cfg);
			} finally {
				setSaving(false);
			}
		},
		[loadAgents, setConfig],
	);

	const reloadAgents = useCallback(() => {
		if (config) void loadAgents(config);
	}, [config, loadAgents]);

	return {
		configured: isConfigured(config),
		config,
		agents,
		agentsStatus,
		selectedAgentId,
		messages,
		isStreaming,
		currentSessionId: sessionId,
		sessions,
		sessionsStatus,
		loadingSessionId,
		canAsk: isConfigured(config) && agentsStatus === "ready" && agents.length > 0 && !isStreaming,
		saving,
		actions: { selectAgent, send, cancel, saveSetup, reloadAgents, newConversation, reloadSessions, openSession },
	};
}
