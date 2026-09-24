// Copyright The Open Forge contributors.
import type { DesktopCanvasArtifactView } from "@preload/api-types/canvas";
import {
	activityPanelTabByProjectAtom,
	canvasArtifactRevisionAtom,
	canvasUnreadCountAtom,
	confirmDialogAtom,
	isCanvasTabVisible,
	pendingCanvasArtifactIdAtom,
	promptAttachmentAtom,
	resolvedThemeAtom,
	sessionDisplayLabel,
	sessionsMapAtom,
} from "@shared/store/atoms";
import { showToast } from "@shared/store/toast-atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActivityWorkspace } from "../registry/context";
import { groupCanvasArtifactsBySession, resolveCanvasSessionTitle } from "../services/canvas-artifact-groups";
import { canvasHtmlDataUrl, classifyCanvasHtmlNavigation } from "../services/canvas-html-sandbox";
import {
	type CanvasPreviewKind,
	canvasPreviewExtension,
	resolveCanvasPreviewKind,
} from "../services/canvas-preview-kind";
import { joinCanvasTargetPath, suggestedCanvasSaveFileName } from "../services/canvas-save-filename";
import {
	CANVAS_ATTACHMENT_OWNER_ID,
	createCanvasSelectionAttachment,
	readCanvasSelectionFromTarget,
} from "../services/canvas-selection-attachment";

export interface CanvasTabRowView {
	readonly artifactId: string;
	readonly title: string;
	readonly kindLabel: string;
	readonly versionLabel: string;
	readonly updatedAtLabel: string;
	readonly missing: boolean;
	readonly externalUpdate: boolean;
}

export interface CanvasTabGroupView {
	readonly sessionId: string;
	readonly sessionTitle: string;
	readonly items: readonly CanvasTabRowView[];
}

export interface CanvasSelectedView {
	readonly artifactId: string;
	readonly title: string;
	readonly version: number;
	readonly versionLabel: string;
	readonly kindLabel: string;
	readonly missing: boolean;
	readonly externalUpdate: boolean;
	readonly previewKind: CanvasPreviewKind;
	readonly contentType?: string;
	readonly content: string;
	readonly extension: string;
	readonly htmlSrc?: string;
}

export interface CanvasTabModel {
	readonly loading: boolean;
	readonly empty: boolean;
	readonly emptyLabel: string;
	readonly emptyHint: string;
	readonly groups: readonly CanvasTabGroupView[];
	readonly selected: CanvasSelectedView | null;
	readonly selectionActionVisible: boolean;
	readonly theme: "light" | "dark";
	readonly labels: {
		readonly back: string;
		readonly open: string;
		readonly saveToProject: string;
		readonly delete: string;
		readonly selectToAsk: string;
		readonly missingFile: string;
		readonly missingFileHint: string;
		readonly externalUpdate: string;
		readonly externalUpdateHint: string;
		readonly htmlSandboxLabel: string;
		readonly groupBySession: string;
		readonly loading: string;
	};
	readonly actions: {
		readonly open: (artifactId: string) => void;
		readonly back: () => void;
		readonly attachSelection: () => void;
		readonly saveToProject: () => void;
		readonly deleteSelected: () => void;
		readonly onPreviewSelectionChange: (target: EventTarget | null) => void;
		readonly onHtmlNavigation: (url: string) => void;
	};
}

export function useCanvasTabModel(): CanvasTabModel {
	const { t } = useTranslation("chat");
	const { t: tCommon } = useTranslation("common");
	const workspace = useActivityWorkspace();
	const sessionsMap = useAtomValue(sessionsMapAtom);
	const theme = useAtomValue(resolvedThemeAtom);
	const setPromptAttachment = useSetAtom(promptAttachmentAtom);
	const setConfirm = useSetAtom(confirmDialogAtom);
	const revision = useAtomValue(canvasArtifactRevisionAtom);
	const pending = useAtomValue(pendingCanvasArtifactIdAtom);
	const setPendingId = useSetAtom(pendingCanvasArtifactIdAtom);
	const setUnread = useSetAtom(canvasUnreadCountAtom);
	const unread = useAtomValue(canvasUnreadCountAtom);
	const tabByProject = useAtomValue(activityPanelTabByProjectAtom);
	const canvasVisible = isCanvasTabVisible(tabByProject, [workspace.id, workspace.cwd]);

	const [items, setItems] = useState<readonly DesktopCanvasArtifactView[]>([]);
	const [loading, setLoading] = useState(true);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [selected, setSelected] = useState<CanvasSelectedView | null>(null);
	const [selectionExcerpt, setSelectionExcerpt] = useState("");

	const sessionTitles = useMemo(() => {
		const titles = new Map<string, string>();
		for (const sessions of sessionsMap.values()) {
			for (const session of sessions) {
				titles.set(session.id, sessionDisplayLabel(session));
			}
		}
		return titles;
	}, [sessionsMap]);

	const reload = useCallback(async () => {
		void revision;
		const result = await window.vetta.canvas.list({ workspaceId: workspace.id });
		if (!result.ok) {
			setItems([]);
			return;
		}
		setItems(result.items);
	}, [revision, workspace.id]);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		void reload().finally(() => {
			if (!cancelled) setLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, [reload]);

	// 未读复位还要依赖计数本身：若增量恰好发生在画布可见期间（写入方与复位方的
	// 时序竞态），仅靠可见性翻转的 effect 会把徽章挂死——增量到达时立即归零。
	useEffect(() => {
		if (canvasVisible && unread > 0) setUnread(0);
	}, [canvasVisible, unread, setUnread]);

	useEffect(() => {
		const onVisible = (): void => {
			if (document.visibilityState === "visible") void reload();
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => document.removeEventListener("visibilitychange", onVisible);
	}, [reload]);

	const kindLabel = useCallback(
		(kind: CanvasPreviewKind): string => {
			if (kind === "html") return t("activityPanel.canvas.kindHtml");
			if (kind === "code") return t("activityPanel.canvas.kindCode");
			return t("activityPanel.canvas.kindMarkdown");
		},
		[t],
	);

	const toRow = useCallback(
		(item: DesktopCanvasArtifactView): CanvasTabRowView => {
			const previewKind = resolveCanvasPreviewKind(item.descriptor);
			return {
				artifactId: item.descriptor.artifactId,
				title: item.descriptor.title,
				kindLabel: kindLabel(previewKind),
				versionLabel: t("activityPanel.canvas.version", { version: item.descriptor.version }),
				updatedAtLabel: formatCanvasTime(item.descriptor.updatedAt),
				missing: item.missing,
				externalUpdate: item.externalUpdate,
			};
		},
		[kindLabel, t],
	);

	const groups = useMemo(
		() =>
			groupCanvasArtifactsBySession(items).map((group) => ({
				sessionId: group.sessionId,
				sessionTitle: resolveCanvasSessionTitle(
					group.sessionId,
					sessionTitles,
					t("activityPanel.canvas.untitledSession"),
				),
				items: group.items.map(toRow),
			})),
		[items, sessionTitles, t, toRow],
	);

	const open = useCallback(
		(artifactId: string) => {
			setSelectedId(artifactId);
			setSelectionExcerpt("");
			void (async () => {
				const result = await window.vetta.canvas.get({ workspaceId: workspace.id, artifactId });
				if (!result.ok) {
					const listed = items.find((item) => item.descriptor.artifactId === artifactId);
					setSelected(
						listed
							? toSelectedView(listed, "", kindLabel, t)
							: {
									artifactId,
									title: artifactId,
									version: 1,
									versionLabel: t("activityPanel.canvas.version", { version: 1 }),
									kindLabel: kindLabel("markdown"),
									missing: true,
									externalUpdate: false,
									previewKind: "markdown",
									content: "",
									extension: ".md",
								},
					);
					return;
				}
				setItems((current) => upsertView(current, result.view));
				setSelected(toSelectedView(result.view, result.content, kindLabel, t));
			})();
		},
		[items, kindLabel, t, workspace.id],
	);

	useEffect(() => {
		// 归属闸门（TASK-0079）：pending 写入方标注了工作空间。不属于本面板的排队项
		// 既不消费也不清全局槽——否则多面板挂载时会拿错 workspace 去拉 artifact，
		// 渲染出标题为原始 artifactId 的假「文件缺失」条目。
		if (!pending || pending.workspaceId !== workspace.id) return;
		// 可见性守卫：画布页签未激活时不抢选区，等用户切回画布再消费。
		if (!canvasVisible) return;
		open(pending.artifactId);
		setPendingId(null);
	}, [canvasVisible, open, pending, setPendingId, workspace.id]);

	const back = useCallback(() => {
		setSelectedId(null);
		setSelected(null);
		setSelectionExcerpt("");
		void reload();
	}, [reload]);

	const attachSelection = useCallback(() => {
		if (!selected || !selectionExcerpt) return;
		const attachment = createCanvasSelectionAttachment({
			artifactId: selected.artifactId,
			version: selected.version,
			excerpt: selectionExcerpt,
			title: selected.title,
			kind: selected.previewKind,
			contentType: selected.contentType,
		});
		setPromptAttachment({
			...attachment,
			ownerPluginId: CANVAS_ATTACHMENT_OWNER_ID,
		});
	}, [selected, selectionExcerpt, setPromptAttachment]);

	const saveToProject = useCallback(() => {
		if (!selected) return;
		void (async () => {
			const folder = await window.vetta.dialog.selectFolder();
			if (!folder) return;
			const listed = items.find((item) => item.descriptor.artifactId === selected.artifactId);
			const fileName = suggestedCanvasSaveFileName({
				title: selected.title,
				contentType: listed?.descriptor.contentType,
				uri: listed?.descriptor.uri,
			});
			const result = await window.vetta.canvas.saveToProject({
				workspaceId: workspace.id,
				artifactId: selected.artifactId,
				targetPath: joinCanvasTargetPath(folder, fileName),
			});
			if (!result.ok) {
				showToast({
					variant: result.code === "conflict" ? "warning" : "error",
					message:
						result.code === "conflict"
							? t("activityPanel.canvas.saveToProjectConflict")
							: t("activityPanel.canvas.saveToProjectFailed"),
				});
				return;
			}
			showToast({ variant: "success", message: t("activityPanel.canvas.saveToProjectSuccess") });
			setItems((current) =>
				current.map((item) =>
					item.descriptor.artifactId === result.descriptor.artifactId
						? { ...item, descriptor: result.descriptor, missing: false }
						: item,
				),
			);
			if (selectedId === result.descriptor.artifactId) {
				open(result.descriptor.artifactId);
			}
		})();
	}, [items, open, selected, selectedId, t, workspace.id]);

	const deleteSelected = useCallback(() => {
		if (!selected) return;
		setConfirm({
			title: t("activityPanel.canvas.delete"),
			message: t("activityPanel.canvas.deleteConfirm", { title: selected.title }),
			confirmLabel: t("activityPanel.canvas.delete"),
			cancelLabel: tCommon("actions.cancel"),
			variant: "danger",
			onConfirm: () => {
				setConfirm(null);
				void (async () => {
					const result = await window.vetta.canvas.delete({
						workspaceId: workspace.id,
						artifactId: selected.artifactId,
					});
					if (!result.ok) {
						showToast({ variant: "error", message: t("activityPanel.canvas.deleteFailed") });
						return;
					}
					setItems((current) => current.filter((item) => item.descriptor.artifactId !== selected.artifactId));
					setSelectedId(null);
					setSelected(null);
				})();
			},
			onCancel: () => setConfirm(null),
		});
	}, [selected, setConfirm, t, tCommon, workspace.id]);

	const onPreviewSelectionChange = useCallback((target: EventTarget | null) => {
		setSelectionExcerpt(readCanvasSelectionFromTarget(target));
	}, []);

	const onHtmlNavigation = useCallback(
		(url: string) => {
			const decision = classifyCanvasHtmlNavigation(url);
			if (decision !== "external") return;
			setConfirm({
				title: t("activityPanel.canvas.openExternalTitle"),
				message: t("activityPanel.canvas.openExternalMessage", { url }),
				confirmLabel: tCommon("actions.confirm"),
				cancelLabel: tCommon("actions.cancel"),
				onConfirm: () => {
					setConfirm(null);
					void window.vetta.shell.openExternal(url);
				},
				onCancel: () => setConfirm(null),
			});
		},
		[setConfirm, t, tCommon],
	);

	return {
		loading,
		empty: !loading && items.length === 0,
		emptyLabel: t("activityPanel.canvas.empty"),
		emptyHint: t("activityPanel.canvas.emptyHint"),
		groups,
		selected,
		selectionActionVisible: Boolean(
			selected && !selected.missing && selected.previewKind !== "html" && selectionExcerpt,
		),
		theme,
		labels: {
			back: tCommon("actions.back"),
			open: t("activityPanel.canvas.open"),
			saveToProject: t("activityPanel.canvas.saveToProject"),
			delete: t("activityPanel.canvas.delete"),
			selectToAsk: t("activityPanel.canvas.selectToAsk"),
			missingFile: t("activityPanel.canvas.missingFile"),
			missingFileHint: t("activityPanel.canvas.missingFileHint"),
			externalUpdate: t("activityPanel.canvas.externalUpdate"),
			externalUpdateHint: t("activityPanel.canvas.externalUpdateHint"),
			htmlSandboxLabel: t("activityPanel.canvas.htmlSandboxLabel"),
			groupBySession: t("activityPanel.canvas.groupBySession"),
			loading: t("activityPanel.canvas.loading"),
		},
		actions: {
			open,
			back,
			attachSelection,
			saveToProject,
			deleteSelected,
			onPreviewSelectionChange,
			onHtmlNavigation,
		},
	};
}

function formatCanvasTime(value: number): string {
	return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function upsertView(
	items: readonly DesktopCanvasArtifactView[],
	view: DesktopCanvasArtifactView,
): readonly DesktopCanvasArtifactView[] {
	const index = items.findIndex((item) => item.descriptor.artifactId === view.descriptor.artifactId);
	if (index === -1) return [...items, view];
	return items.map((item, itemIndex) => (itemIndex === index ? view : item));
}

function toSelectedView(
	view: DesktopCanvasArtifactView,
	content: string,
	kindLabel: (kind: CanvasPreviewKind) => string,
	t: (key: "activityPanel.canvas.version", options: { version: number }) => string,
): CanvasSelectedView {
	const previewKind = resolveCanvasPreviewKind(view.descriptor);
	return {
		artifactId: view.descriptor.artifactId,
		title: view.descriptor.title,
		version: view.descriptor.version,
		versionLabel: t("activityPanel.canvas.version", { version: view.descriptor.version }),
		kindLabel: kindLabel(previewKind),
		missing: view.missing,
		externalUpdate: view.externalUpdate,
		previewKind,
		contentType: view.descriptor.contentType,
		content: view.missing ? "" : content,
		extension: canvasPreviewExtension(view.descriptor),
		htmlSrc: !view.missing && previewKind === "html" ? canvasHtmlDataUrl(content) : undefined,
	};
}
