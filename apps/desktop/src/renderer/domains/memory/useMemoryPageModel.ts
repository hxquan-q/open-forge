// Modified by The Open Forge contributors.
import { useCallback, useMemo, useState } from "react";
import type { MemoryListItem, MemoryPolicyState } from "@/shared/memory";
import { type MemoryScopeTab, useMemoryListModel } from "./useMemoryListModel";

/**
 * 记忆页整页模型（TASK-0505 / PLAN-0032 P4c）：在 `useMemoryListModel` 之上
 * 聚合纠正/忘记面板状态与详情分屏开合、宽度。视图层只消费本模型的字段。
 */

export type MemoryOverlay = { readonly kind: "correct" | "forget"; readonly item: MemoryListItem } | null;

export function useMemoryPageModel() {
	const listModel = useMemoryListModel();
	const [overlay, setOverlay] = useState<MemoryOverlay>(null);
	const [correctContent, setCorrectContent] = useState("");
	const [correctSaving, setCorrectSaving] = useState(false);
	const [correctConflict, setCorrectConflict] = useState(false);
	const [forgetAlsoSources, setForgetAlsoSources] = useState(false);
	const [forgetSaving, setForgetSaving] = useState(false);
	const [detailWidth, setDetailWidth] = useState(420);

	const openCorrect = useCallback((item: MemoryListItem) => {
		setCorrectContent(item.content);
		setCorrectConflict(false);
		setOverlay({ kind: "correct", item });
	}, []);

	const openForget = useCallback((item: MemoryListItem) => {
		setForgetAlsoSources(false);
		setOverlay({ kind: "forget", item });
	}, []);

	const closeOverlay = useCallback(() => setOverlay(null), []);

	const submitCorrect = useCallback(async () => {
		if (overlay?.kind !== "correct") return;
		setCorrectSaving(true);
		setCorrectConflict(false);
		try {
			await listModel.correct({
				memoryId: overlay.item.memoryId,
				expectedRevision: listModel.detail?.revisions.length ?? 1,
				content: correctContent,
			});
			setOverlay(null);
		} catch {
			setCorrectConflict(true);
		} finally {
			setCorrectSaving(false);
		}
	}, [correctContent, listModel, overlay]);

	const submitForget = useCallback(async () => {
		if (overlay?.kind !== "forget") return;
		setForgetSaving(true);
		try {
			await listModel.forget(overlay.item.memoryId, forgetAlsoSources);
			setOverlay(null);
		} finally {
			setForgetSaving(false);
		}
	}, [forgetAlsoSources, listModel, overlay]);

	const setMode = useCallback((mode: MemoryPolicyState["mode"]) => void listModel.setMode({ mode }), [listModel]);

	return useMemo(
		() => ({
			list: listModel,
			overlay,
			correctContent,
			setCorrectContent,
			correctSaving,
			correctConflict,
			forgetAlsoSources,
			setForgetAlsoSources,
			forgetSaving,
			openCorrect,
			openForget,
			closeOverlay,
			submitCorrect,
			submitForget,
			setMode,
			scope: listModel.scope,
			setScope: listModel.setScope,
			query: listModel.query,
			setQuery: listModel.setQuery,
			detailOpen: listModel.detail !== null,
			detailWidth,
			setDetailWidth,
		}),
		[
			listModel,
			overlay,
			correctContent,
			correctSaving,
			correctConflict,
			forgetAlsoSources,
			forgetSaving,
			openCorrect,
			openForget,
			closeOverlay,
			submitCorrect,
			submitForget,
			setMode,
			detailWidth,
		],
	);
}

export type MemoryPageModel = ReturnType<typeof useMemoryPageModel>;
export type { MemoryScopeTab };
