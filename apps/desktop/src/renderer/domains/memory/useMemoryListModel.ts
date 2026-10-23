// Modified by The Open Forge contributors.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MemoryForgetResult, MemoryListItem, MemoryPolicyState, MemorySearchRequest } from "@/shared/memory";
import { memoryControlClient } from "./memoryControlClient";

/**
 * 记忆管理页面模型（TASK-0377）：加载/空/失败/保存/冲突/降级状态机。
 * 先渲染页面壳（loading 骨架）再发起昂贵请求；模式切换与增删改共享
 * 同一刷新路径，遗忘后立即重读列表，不本地造成功假象。
 */

export type MemoryScopeTab = "all" | "user" | "project";

export interface MemoryDetailState {
	readonly memoryId: string;
	readonly loading: boolean;
	readonly error?: string;
	readonly revisions: readonly { revisionNo: number; content: string; status: string; recordedAt: string }[];
	readonly sources: readonly { sourceId: string; role: string }[];
}

export function useMemoryListModel() {
	const [policy, setPolicyState] = useState<MemoryPolicyState | null>(null);
	const [policyError, setPolicyError] = useState(false);
	const [modeSaving, setModeSaving] = useState(false);
	const [scope, setScope] = useState<MemoryScopeTab>("all");
	const [query, setQuery] = useState("");
	const [items, setItems] = useState<readonly MemoryListItem[]>([]);
	const [page, setPage] = useState(1);
	const [hasMore, setHasMore] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);
	const [degraded, setDegraded] = useState(false);
	const [detail, setDetail] = useState<MemoryDetailState | null>(null);
	const [forgetOutcome, setForgetOutcome] = useState<MemoryForgetResult | null>(null);
	const refreshToken = useRef(0);

	const refresh = useCallback(
		async (nextPage: number, append: boolean) => {
			const token = ++refreshToken.current;
			if (!append) setLoading(true);
			setError(false);
			try {
				const trimmed = query.trim();
				const response = trimmed
					? await memoryControlClient.searchMemories({
							query: trimmed,
							scope,
							limit: 20,
						} satisfies MemorySearchRequest)
					: await memoryControlClient.listMemories({ scope, page: nextPage, pageSize: 20 });
				if (token !== refreshToken.current) return;
				const nextItems: readonly MemoryListItem[] = response.items;
				setItems(append ? [...items, ...nextItems] : nextItems);
				setDegraded("degraded" in response && response.degraded === true);
				setHasMore("hasMore" in response && response.hasMore === true);
				setPage(nextPage);
			} catch {
				if (token === refreshToken.current) {
					setError(true);
					if (!append) setItems([]);
				}
			} finally {
				if (token === refreshToken.current) setLoading(false);
			}
		},
		[items, query, scope],
	);

	useEffect(() => {
		void refresh(1, false);
	}, [refresh]);

	useEffect(() => {
		let cancelled = false;
		memoryControlClient
			.getMemoryPolicy()
			.then((state) => {
				if (!cancelled) {
					setPolicyState(state);
					setPolicyError(false);
				}
			})
			.catch(() => {
				if (!cancelled) setPolicyError(true);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const setMode = useCallback(async (state: MemoryPolicyState) => {
		setModeSaving(true);
		try {
			const saved = await memoryControlClient.setMemoryPolicy(state);
			setPolicyState(saved);
		} finally {
			setModeSaving(false);
		}
	}, []);

	const openDetail = useCallback(async (memoryId: string) => {
		setDetail({ memoryId, loading: true, revisions: [], sources: [] });
		try {
			const result = await memoryControlClient.getMemoryDetail(memoryId);
			setDetail({ memoryId, loading: false, revisions: result.revisions, sources: result.sources });
		} catch (error) {
			setDetail({
				memoryId,
				loading: false,
				revisions: [],
				sources: [],
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}, []);

	const correct = useCallback(
		async (request: { memoryId: string; expectedRevision: number; content: string }) => {
			await memoryControlClient.correctMemory(request);
			await refresh(1, false);
			await openDetail(request.memoryId);
		},
		[openDetail, refresh],
	);

	const forget = useCallback(
		async (memoryId: string, alsoProcessSources: boolean) => {
			const outcome = await memoryControlClient.forgetMemory({ memoryId, alsoProcessSources });
			setForgetOutcome(outcome);
			setDetail(null);
			await refresh(1, false);
			return outcome;
		},
		[refresh],
	);

	return useMemo(
		() => ({
			policy,
			policyError,
			modeSaving,
			setMode,
			scope,
			setScope,
			query,
			setQuery,
			items,
			page,
			hasMore,
			loading,
			error,
			degraded,
			detail,
			openDetail,
			closeDetail: () => setDetail(null),
			correct,
			forget,
			forgetOutcome,
			loadMore: () => void refresh(page + 1, true),
			retry: () => void refresh(1, false),
		}),
		[
			correct,
			degraded,
			detail,
			error,
			forget,
			forgetOutcome,
			hasMore,
			items,
			loading,
			modeSaving,
			openDetail,
			page,
			policy,
			policyError,
			query,
			refresh,
			setMode,
			scope,
		],
	);
}
