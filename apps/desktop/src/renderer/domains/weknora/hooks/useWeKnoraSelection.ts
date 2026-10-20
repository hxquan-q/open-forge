// Copyright The Open Forge contributors.

import { useCallback, useMemo, useState } from "react";

/**
 * 历史会话「多选模式」的选择状态（AC-8）。
 *
 * 模型参照 file-explorer 的 `SelectionState`（有序集合 + anchor/focus），但**不跨域 import**
 * （AGENTS.md：领域间不直接 import 内部模块）——本域只用到「勾选集合」这一子集，
 * 故只保留 id 集合与模式开关，不搬 anchor/focus/范围选择那套（YAGNI）。
 *
 * 模式开关（`active`）与集合放在一起：进入/退出天然要清空集合，拆开会让调用方
 * 自己维护两者的同步（容易漏清）。禁选判定（streaming 会话）由调用方在渲染层落实，
 * 本 hook 只管集合本身。
 */
export interface WeKnoraSelection {
	/** 是否处于多选模式。 */
	readonly active: boolean;
	/** 已勾选的会话 id 集合。 */
	readonly selectedIds: ReadonlySet<string>;
	/** 已勾选数量（操作条计数）。 */
	readonly count: number;
	readonly isSelected: (sessionId: string) => boolean;
	/** 进入多选模式（清空既有选择）。 */
	readonly enter: () => void;
	/** 退出多选模式并清空选择。 */
	readonly exit: () => void;
	/** 勾选 / 取消勾选单个会话。 */
	readonly toggle: (sessionId: string) => void;
	/** 全选（传入「可选集合」——streaming 会话已由调用方剔除）。 */
	readonly selectAll: (sessionIds: readonly string[]) => void;
	/** 剔除已不在列表中的会话（列表刷新后收敛，避免计数虚高）。 */
	readonly prune: (existingIds: ReadonlySet<string>) => void;
}

export function useWeKnoraSelection(): WeKnoraSelection {
	const [active, setActive] = useState(false);
	const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set<string>());

	const enter = useCallback(() => {
		setSelectedIds(new Set<string>());
		setActive(true);
	}, []);

	const exit = useCallback(() => {
		setSelectedIds(new Set<string>());
		setActive(false);
	}, []);

	const toggle = useCallback((sessionId: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(sessionId)) next.delete(sessionId);
			else next.add(sessionId);
			return next;
		});
	}, []);

	const selectAll = useCallback((sessionIds: readonly string[]) => {
		setSelectedIds(new Set(sessionIds));
	}, []);

	const prune = useCallback((existingIds: ReadonlySet<string>) => {
		setSelectedIds((prev) => {
			let dropped = false;
			const next = new Set<string>();
			for (const id of prev) {
				if (existingIds.has(id)) next.add(id);
				else dropped = true;
			}
			// 无变化时返回原引用，避免每次列表刷新都触发无谓重渲染。
			return dropped ? next : prev;
		});
	}, []);

	const isSelected = useCallback((sessionId: string) => selectedIds.has(sessionId), [selectedIds]);

	return useMemo(
		() => ({ active, selectedIds, count: selectedIds.size, isSelected, enter, exit, toggle, selectAll, prune }),
		[active, selectedIds, isSelected, enter, exit, toggle, selectAll, prune],
	);
}
