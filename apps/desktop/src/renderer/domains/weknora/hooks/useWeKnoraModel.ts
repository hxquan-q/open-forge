// Copyright The Open Forge contributors.

import type { WeKnoraAgent, WeKnoraPublicConfig, WeKnoraSession } from "@preload/api";
import { useAtom } from "jotai";
import { useCallback, useEffect } from "react";
import {
	type WeKnoraAgentsStatus,
	type WeKnoraChatMessage,
	type WeKnoraHistoryStatus,
	weKnoraAgentsStatusAtom,
} from "../atoms";
import { useWeKnoraAgents } from "./useWeKnoraAgents";
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
		},
	};
}
