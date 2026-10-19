// Copyright The Open Forge contributors.

import type { WeKnoraPublicConfig, WeKnoraSession } from "@preload/api";
import { useAtom } from "jotai";
import { useCallback, useState } from "react";
import {
	sortSessionsByRecency,
	toChatMessages,
	type WeKnoraChatMessage,
	type WeKnoraHistoryStatus,
	weKnoraSessionsAtom,
	weKnoraSessionsStatusAtom,
} from "../atoms";
import { HISTORY_PAGE_SIZE } from "./weKnoraModelSupport";

export interface WeKnoraHistoryState {
	readonly sessions: readonly WeKnoraSession[];
	readonly sessionsStatus: WeKnoraHistoryStatus;
	/** 正在载入的历史会话 id（用于列表行 loading 态）。 */
	readonly loadingSessionId: string | null;
	/** 拉取历史会话列表（AC-13）：**不带 `agent_id` 过滤**（v4）、固定分页、按更新时间倒序。 */
	readonly loadSessions: () => Promise<void>;
	/** 用当前配置重新拉取（失败 / 空态的重试入口）。 */
	readonly reloadSessions: () => void;
	/**
	 * 拉取某会话的消息并转成页面消息（AC-14）。失败返回 `null`（不抛、不切换 —— 失败收口是 T06 范围）。
	 */
	readonly fetchMessages: (sessionId: string) => Promise<WeKnoraChatMessage[] | null>;
}

/** 历史 actor：会话列表，以及「取某会话的消息」。切换当前会话是对话 actor 的事。 */
export function useWeKnoraHistory({ config }: { config: WeKnoraPublicConfig | null }): WeKnoraHistoryState {
	const [sessions, setSessions] = useAtom(weKnoraSessionsAtom);
	const [sessionsStatus, setSessionsStatus] = useAtom(weKnoraSessionsStatusAtom);
	const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);

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

	const reloadSessions = useCallback(() => {
		if (config) void loadSessions();
	}, [config, loadSessions]);

	const fetchMessages = useCallback(async (sessionId: string): Promise<WeKnoraChatMessage[] | null> => {
		setLoadingSessionId(sessionId);
		try {
			const loaded = await window.vetta.weknora.loadMessages({ sessionId, limit: HISTORY_PAGE_SIZE });
			return toChatMessages(loaded);
		} catch {
			return null;
		} finally {
			setLoadingSessionId(null);
		}
	}, []);

	return { sessions, sessionsStatus, loadingSessionId, loadSessions, reloadSessions, fetchMessages };
}
