// Copyright The Open Forge contributors.
import { usePreviewNav } from "@domains/file-preview/components/FilePreviewView";
import {
	activityPanelPreviewAvailableAtom,
	clearInlineFilePreviewContextAtom,
	closeInlineFilePreviewAtom,
	type FilePreviewContext,
	inlineFilePreviewAtom,
	inlineFilePreviewContextReadonlyAtom,
} from "@shared/store/atoms";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";

const TREE_DEFAULT_WIDTH = 220;
const TREE_MIN_WIDTH = 160;
const TREE_MAX_WIDTH = 360;
const PREVIEW_MOUNT_DELAY_MS = 240;

export interface FileTabContentModel {
	showTree: boolean;
	showPreview: boolean;
	treeWidth: number;
	treeCollapsed: boolean;
	previewMounted: boolean;
	previewCtx: FilePreviewContext | null;
	canPrev: boolean;
	canNext: boolean;
	onTreeResize: (delta: number) => void;
	toggleTree: () => void;
	goPrev: () => void;
	goNext: () => void;
	closePreview: () => void;
}

export function useFileTabContentModel(): FileTabContentModel {
	const [previewCtx, setPreviewCtx] = useAtom(inlineFilePreviewContextReadonlyAtom);
	const setPreview = useSetAtom(inlineFilePreviewAtom);
	const closePreview = useSetAtom(closeInlineFilePreviewAtom);
	const previewAvailable = useAtomValue(activityPanelPreviewAvailableAtom);
	const { goPrev, goNext } = usePreviewNav((updater) => {
		if (typeof updater === "function") {
			setPreviewCtx(updater(previewCtx));
		} else {
			setPreview(updater);
		}
	});
	const onClosePreview = useCallback(() => closePreview(), [closePreview]);

	const showPreview = previewCtx !== null && previewAvailable;
	const [previewMounted, setPreviewMounted] = useState(false);
	useEffect(() => {
		if (!showPreview) {
			setPreviewMounted(false);
			return;
		}
		const timer = setTimeout(() => setPreviewMounted(true), PREVIEW_MOUNT_DELAY_MS);
		return () => clearTimeout(timer);
	}, [showPreview]);

	const [treeWidth, setTreeWidth] = useState(TREE_DEFAULT_WIDTH);
	const onTreeResize = useCallback((delta: number) => {
		setTreeWidth((currentWidth) => Math.max(TREE_MIN_WIDTH, Math.min(TREE_MAX_WIDTH, currentWidth + delta)));
	}, []);

	const [treeCollapsed, setTreeCollapsed] = useState(false);
	const toggleTree = useCallback(() => setTreeCollapsed((collapsed) => !collapsed), []);
	useEffect(() => {
		if (!showPreview) setTreeCollapsed(false);
	}, [showPreview]);

	// 卸载只清预览上下文、不回拉宽度（BUG-0162）：切走页签时的面板宽度属于版块态
	// 初始化或用户选择；回拉语义只属于用户主动点「关闭预览」。
	const clearPreviewOnUnmount = useSetAtom(clearInlineFilePreviewContextAtom);
	useEffect(() => () => clearPreviewOnUnmount(), [clearPreviewOnUnmount]);

	return {
		showTree: !showPreview || !treeCollapsed,
		showPreview,
		treeWidth,
		treeCollapsed,
		previewMounted,
		previewCtx,
		canPrev: previewCtx !== null && previewCtx.index > 0,
		canNext: previewCtx !== null && previewCtx.index < previewCtx.items.length - 1,
		onTreeResize,
		toggleTree,
		goPrev,
		goNext,
		closePreview: onClosePreview,
	};
}
