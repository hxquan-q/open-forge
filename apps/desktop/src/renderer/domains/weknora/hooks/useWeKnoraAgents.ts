// Copyright The Open Forge contributors.

import type { WeKnoraAgent, WeKnoraPublicConfig } from "@preload/api";
import { useAtom } from "jotai";
import { useCallback } from "react";
import {
	type WeKnoraAgentsStatus,
	weKnoraAgentsAtom,
	weKnoraAgentsStatusAtom,
	weKnoraSelectedAgentIdAtom,
} from "../atoms";

export interface WeKnoraAgentsState {
	readonly agents: readonly WeKnoraAgent[];
	readonly agentsStatus: WeKnoraAgentsStatus;
	readonly selectedAgentId: string | null;
	/** 按配置分页拉取全部可见智能体；空列表 / 失败落到 `empty` / `error`（AC-16 / AC-19）。 */
	readonly loadAgents: (config: WeKnoraPublicConfig) => Promise<void>;
	/** 切换当前选中的智能体；持久化到配置，下一条消息即生效（AC-17/18）。 */
	readonly selectAgent: (agentId: string) => void;
	/** 用当前配置重新拉取（失败 / 空态的重试入口）。 */
	readonly reloadAgents: () => void;
}

/** 智能体 actor：可见智能体列表、加载状态与「当前选中」。 */
export function useWeKnoraAgents({ config }: { config: WeKnoraPublicConfig | null }): WeKnoraAgentsState {
	const [agents, setAgents] = useAtom(weKnoraAgentsAtom);
	const [agentsStatus, setAgentsStatus] = useAtom(weKnoraAgentsStatusAtom);
	const [selectedAgentId, setSelectedAgentId] = useAtom(weKnoraSelectedAgentIdAtom);

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

	const selectAgent = useCallback(
		(agentId: string) => {
			setSelectedAgentId(agentId);
			// 持久化「当前选中」以便再次进入仍记得（AC-17）；提问时再把选中值显式传给 ask（AC-18 v5）。
			void window.vetta.weknora.setConfig({ defaultAgentId: agentId });
		},
		[setSelectedAgentId],
	);

	const reloadAgents = useCallback(() => {
		if (config) void loadAgents(config);
	}, [config, loadAgents]);

	return { agents, agentsStatus, selectedAgentId, loadAgents, selectAgent, reloadAgents };
}
