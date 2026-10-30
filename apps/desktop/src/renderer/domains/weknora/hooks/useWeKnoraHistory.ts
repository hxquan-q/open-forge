// Copyright The Open Forge contributors.

import type { WeKnoraPublicConfig, WeKnoraSession } from "@preload/api";
import { useAtom } from "jotai";
import { useCallback, useRef, useState } from "react";
import {
	sortSessionsByRecency,
	toChatMessages,
	type WeKnoraChatMessage,
	type WeKnoraErrorCode,
	type WeKnoraHistoryStatus,
	weKnoraDeleteErrorAtom,
	weKnoraDeletingSessionIdAtom,
	weKnoraSessionsAtom,
	weKnoraSessionsStatusAtom,
} from "../atoms";
import { errorCodeOf, HISTORY_PAGE_SIZE } from "./weKnoraModelSupport";

/**
 * 单会话删除的结果（`removeSession` 的返回形状）。
 *
 * `ok=false` 时带上归一化错误码——批量删除需要**逐会话**的错误明细（T04 聚合「成功 N/失败 M」），
 * 而共享的 `deleteError` atom 只能记住「最近一次」，故让原语直接回传结果，调用方无需回读 atom。
 */
export interface WeKnoraSessionRemoval {
	readonly ok: boolean;
	readonly errorCode: WeKnoraErrorCode | null;
}

export interface WeKnoraHistoryState {
	readonly sessions: readonly WeKnoraSession[];
	readonly sessionsStatus: WeKnoraHistoryStatus;
	/** 正在载入的历史会话 id（用于列表行 loading 态）。 */
	readonly loadingSessionId: string | null;
	/** 正在删除的会话 id（AC-12 防重复标记）；`null` = 无进行中的删除。 */
	readonly deletingSessionId: string | null;
	/** 删除失败的归一化错误码（AC-11）；`null` = 无错误。 */
	readonly deleteError: WeKnoraErrorCode | null;
	/** 拉取历史会话列表（AC-13）：**不带 `agent_id` 过滤**（v4）、固定分页、按更新时间倒序。 */
	readonly loadSessions: () => Promise<void>;
	/** 用当前配置重新拉取（失败 / 空态的重试入口）。 */
	readonly reloadSessions: () => void;
	/**
	 * 拉取某会话的消息并转成页面消息（AC-14）。失败返回 `null`（不抛、不切换 —— 失败收口是 T06 范围）。
	 */
	readonly fetchMessages: (sessionId: string) => Promise<WeKnoraChatMessage[] | null>;
	/**
	 * 删除会话**原语**（AC-8/11/12）：只调 IPC 并管理 deleting/deleteError 两个状态。
	 * 不碰聊天区、**不乐观改列表**（成功后的重拉与「当前会话回空态」由编排层
	 * `useWeKnoraModel.deleteSession` 负责）——失败时列表绝不假装删掉。
	 *
	 * 返回 `WeKnoraSessionRemoval`：批量删除据此逐会话聚合结果（T04），不必回读共享 atom。
	 */
	readonly removeSession: (sessionId: string) => Promise<WeKnoraSessionRemoval>;
}

/** 历史 actor：会话列表，以及「取某会话的消息」。切换当前会话是对话 actor 的事。 */
export function useWeKnoraHistory({ config }: { config: WeKnoraPublicConfig | null }): WeKnoraHistoryState {
	const [sessions, setSessions] = useAtom(weKnoraSessionsAtom);
	const [sessionsStatus, setSessionsStatus] = useAtom(weKnoraSessionsStatusAtom);
	const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
	const [deletingSessionId, setDeletingSessionId] = useAtom(weKnoraDeletingSessionIdAtom);
	const [deleteError, setDeleteError] = useAtom(weKnoraDeleteErrorAtom);
	const sessionsRequest = useRef<Promise<void> | null>(null);

	const loadSessions = useCallback(() => {
		// A new session and a background terminal can request the list together.
		sessionsRequest.current ??= (async () => {
			setSessionsStatus("loading");
			try {
				const list = await window.vetta.weknora.listSessions({ page: 1, pageSize: HISTORY_PAGE_SIZE });
				setSessions(sortSessionsByRecency(list));
				setSessionsStatus("ready");
			} catch {
				setSessions([]);
				setSessionsStatus("error");
			} finally {
				sessionsRequest.current = null;
			}
		})();
		return sessionsRequest.current;
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

	const removeSession = useCallback(
		async (sessionId: string): Promise<WeKnoraSessionRemoval> => {
			// 新删除开始即清上一次的失败码（02-plan §2.4）：内联错误块随之消失，失败再落新码。
			setDeletingSessionId(sessionId);
			setDeleteError(null);
			try {
				await window.vetta.weknora.deleteSession({ sessionId });
				return { ok: true, errorCode: null };
			} catch (error) {
				const code = errorCodeOf(error);
				setDeleteError(code);
				return { ok: false, errorCode: code };
			} finally {
				setDeletingSessionId(null);
			}
		},
		[setDeleteError, setDeletingSessionId],
	);

	return {
		sessions,
		sessionsStatus,
		loadingSessionId,
		deletingSessionId,
		deleteError,
		loadSessions,
		reloadSessions,
		fetchMessages,
		removeSession,
	};
}
