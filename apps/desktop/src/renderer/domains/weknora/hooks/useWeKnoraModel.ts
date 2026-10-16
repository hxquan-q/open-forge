// Copyright The Open Forge contributors.

import type { WeKnoraAgent, WeKnoraConfigPatch, WeKnoraPublicConfig, WeKnoraStreamEvent } from "@preload/api";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	applyStreamEvent,
	isTerminalStreamEvent,
	type WeKnoraAgentsStatus,
	type WeKnoraChatMessage,
	type WeKnoraErrorCode,
	weKnoraActiveRequestIdAtom,
	weKnoraAgentsAtom,
	weKnoraAgentsStatusAtom,
	weKnoraConfigAtom,
	weKnoraMessagesAtom,
	weKnoraSelectedAgentIdAtom,
	weKnoraSessionIdAtom,
	weKnoraStreamingAtom,
} from "../atoms";

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
}

export interface WeKnoraViewModel {
	readonly configured: boolean;
	readonly config: WeKnoraPublicConfig | null;
	readonly agents: readonly WeKnoraAgent[];
	readonly agentsStatus: WeKnoraAgentsStatus;
	readonly selectedAgentId: string | null;
	readonly messages: readonly WeKnoraChatMessage[];
	readonly isStreaming: boolean;
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

	// 初始化：读配置；已配置才拉智能体列表（未配置绝不发请求，AC-2）。
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const cfg = await window.vetta.weknora.getConfig();
				if (cancelled) return;
				setConfig(cfg);
				if (isConfigured(cfg)) {
					await loadAgents(cfg);
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
	}, [loadAgents, setConfig, setAgentsStatus]);

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
		canAsk: isConfigured(config) && agentsStatus === "ready" && agents.length > 0 && !isStreaming,
		saving,
		actions: { selectAgent, send, cancel, saveSetup, reloadAgents },
	};
}
