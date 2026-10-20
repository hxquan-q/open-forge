// Copyright The Open Forge contributors.

import type { WeKnoraAgent, WeKnoraPublicConfig, WeKnoraSession } from "@preload/api";
import { useAtom } from "jotai";
import { useCallback, useEffect } from "react";
import {
	type WeKnoraAgentsStatus,
	type WeKnoraChatMessage,
	type WeKnoraErrorCode,
	type WeKnoraHistoryStatus,
	weKnoraAgentsStatusAtom,
} from "../atoms";
import { useWeKnoraAgents } from "./useWeKnoraAgents";
import { useWeKnoraBatchActions, type WeKnoraBatchDeleteResult } from "./useWeKnoraBatchActions";
import { useWeKnoraChat } from "./useWeKnoraChat";
import { useWeKnoraHistory } from "./useWeKnoraHistory";
import { useWeKnoraSetup, type WeKnoraSetupInput } from "./useWeKnoraSetup";
import { isConfigured } from "./weKnoraModelSupport";

export type { WeKnoraSetupInput } from "./useWeKnoraSetup";

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
	/**
	 * 删除历史会话（AC-8/9）：真删 WeKnora 侧；成功且是当前会话则重置为「新对话」空态，
	 * 随后重拉列表。返回是否成功（失败码在 `deleteError`，由侧栏内联错误块展示）。
	 */
	readonly deleteSession: (sessionId: string) => Promise<boolean>;
	/**
	 * 批量删除历史会话（AC-10）：逐个复用 `removeSession`，聚合成「成功 N / 失败 M(会话 id + 错误码)」；
	 * 删到当前会话则回空态，完成后重拉列表（失败项原样保留，列表如实刷新）。
	 */
	readonly deleteSessions: (sessionIds: readonly string[]) => Promise<WeKnoraBatchDeleteResult>;
}

export interface WeKnoraViewModel {
	readonly configured: boolean;
	readonly config: WeKnoraPublicConfig | null;
	readonly agents: readonly WeKnoraAgent[];
	readonly agentsStatus: WeKnoraAgentsStatus;
	readonly selectedAgentId: string | null;
	readonly messages: readonly WeKnoraChatMessage[];
	/** **当前会话**是否在流式中（per-session 语义，AC-18）：驱动输入区与取消入口。 */
	readonly isStreaming: boolean;
	/** 有活跃流（含后台思考）的会话 id 集合：历史列表行级指示（AC-19）与禁删判定（AC-10）的事实源。 */
	readonly streamingSessionIds: ReadonlySet<string>;
	/** 当前对话绑定的 WeKnora 会话 id；`null` 表示「新对话，尚未建会话」（AC-11/12）。 */
	readonly currentSessionId: string | null;
	readonly sessions: readonly WeKnoraSession[];
	readonly sessionsStatus: WeKnoraHistoryStatus;
	/** 正在载入的历史会话 id（用于列表行 loading 态）。 */
	readonly loadingSessionId: string | null;
	/** 正在删除的会话 id（AC-12 请求进行中标记，确认按钮防重复的驱动源）；`null` = 无。 */
	readonly deletingSessionId: string | null;
	/** 批量删除进行中（T04：确认按钮防重复的驱动源）；`false` = 无。 */
	readonly batchDeleting: boolean;
	/** 删除失败的归一化错误码（AC-11，侧栏内联错误块的数据源）；`null` = 无。 */
	readonly deleteError: WeKnoraErrorCode | null;
	/** 允许提问：已配置 + 有可用智能体 + 无进行中的回答（AC-7 / AC-19）。 */
	readonly canAsk: boolean;
	readonly saving: boolean;
	readonly actions: WeKnoraModelActions;
}

/**
 * 「智能客服」的视图模型（连接层逻辑）。
 *
 * 只经 `window.vetta.weknora` 的 IPC 合同与主进程交互，不直接触网（红线 C3）；
 * 未配置时**一个网络请求都不发**（AC-2 / AC-19）。
 *
 * 本文件是**组装层**：按 actor 拆出的四个 hook —— `useWeKnoraSetup`(配置) /
 * `useWeKnoraAgents`(智能体) / `useWeKnoraHistory`(历史) / `useWeKnoraChat`(对话流式) ——
 * 各自只管自己的状态与动作，这里把它们接线成对外不变的 view model（红线 C7：一个文件对一个 actor 负责）。
 * 跨 actor 的编排（初始化、保存后刷新）留在这一层，因为它天然需要多个 actor 的能力。
 */
export function useWeKnoraModel(): WeKnoraViewModel {
	const setup = useWeKnoraSetup();
	const agents = useWeKnoraAgents({ config: setup.config });
	const history = useWeKnoraHistory({ config: setup.config });
	const batch = useWeKnoraBatchActions({ removeSession: history.removeSession });
	const chat = useWeKnoraChat({
		config: setup.config,
		agents: agents.agents,
		agentsStatus: agents.agentsStatus,
		selectedAgentId: agents.selectedAgentId,
		loadSessions: history.loadSessions,
		fetchMessages: history.fetchMessages,
	});
	const [, setAgentsStatus] = useAtom(weKnoraAgentsStatusAtom);

	// 初始化：读配置；已配置才拉智能体列表 + 历史会话（未配置绝不发请求，AC-2）。
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const cfg = await setup.loadConfig();
			if (cancelled) return;
			if (cfg && isConfigured(cfg)) {
				await agents.loadAgents(cfg);
				await history.loadSessions();
			} else {
				setAgentsStatus("idle");
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [setup.loadConfig, agents.loadAgents, history.loadSessions, setAgentsStatus]);

	const saveSetup = useCallback(
		async (input: WeKnoraSetupInput) => {
			const cfg = await setup.writeSetup(input);
			// 缺陷 1（实机反馈）：初始化 effect 的依赖不含 `config`（加了会与 `setConfig` 自激循环），
			// 因此配置从「未就绪」变为「就绪」时不会自动重拉历史 —— 保存配置后必须在这里显式拉一次。
			if (cfg && isConfigured(cfg)) {
				await agents.loadAgents(cfg);
				await history.loadSessions();
			}
		},
		[setup.writeSetup, agents.loadAgents, history.loadSessions],
	);

	/**
	 * 删除会话的**编排**（AC-8/9）：跨 history（删 + 重拉）与 chat（当前会话回空态）两个
	 * actor，天然归本组装层（02-plan §2.4）。失败时不动聊天区、不重拉 —— 失败码已由
	 * `removeSession` 落进 `deleteError`，侧栏出内联错误，列表保持原样（不假装删掉）。
	 */
	const deleteSession = useCallback(
		async (sessionId: string): Promise<boolean> => {
			const outcome = await history.removeSession(sessionId);
			if (!outcome.ok) return false;
			// AC-9：删的是当前打开的会话 → 复用「新建对话」语义回空态（消息清空、指针置空）。
			// 禁删判定（AC-10）已保证被删会话无活跃流，不会误伤后台思考。
			if (chat.sessionId === sessionId) chat.newConversation();
			await history.loadSessions();
			return true;
		},
		[chat.newConversation, chat.sessionId, history.loadSessions, history.removeSession],
	);

	/**
	 * 批量删除的**编排**（AC-10）：串行循环归 `useWeKnoraBatchActions`，这里只做跨 actor 的收尾——
	 * 删到当前会话则回空态（同单删语义），完成后**重拉一次**列表（不是每删一个拉一次）。
	 * 失败项不静默：聚合结果原样返回给调用方展示，列表重拉后失败会话仍在（不假装删掉）。
	 */
	const deleteSessions = useCallback(
		async (sessionIds: readonly string[]): Promise<WeKnoraBatchDeleteResult> => {
			const result = await batch.deleteSessions(sessionIds);
			if (chat.sessionId !== null && result.succeeded.includes(chat.sessionId)) chat.newConversation();
			await history.loadSessions();
			return result;
		},
		[batch.deleteSessions, chat.newConversation, chat.sessionId, history.loadSessions],
	);

	return {
		configured: isConfigured(setup.config),
		config: setup.config,
		agents: agents.agents,
		agentsStatus: agents.agentsStatus,
		selectedAgentId: agents.selectedAgentId,
		messages: chat.messages,
		isStreaming: chat.isStreaming,
		streamingSessionIds: chat.streamingSessionIds,
		currentSessionId: chat.sessionId,
		sessions: history.sessions,
		sessionsStatus: history.sessionsStatus,
		loadingSessionId: history.loadingSessionId,
		deletingSessionId: history.deletingSessionId,
		batchDeleting: batch.running,
		deleteError: history.deleteError,
		canAsk: chat.canAsk,
		saving: setup.saving,
		actions: {
			selectAgent: agents.selectAgent,
			send: chat.send,
			cancel: chat.cancel,
			saveSetup,
			reloadAgents: agents.reloadAgents,
			newConversation: chat.newConversation,
			reloadSessions: history.reloadSessions,
			openSession: chat.openSession,
			deleteSession,
			deleteSessions,
		},
	};
}
