// Copyright The Open Forge contributors.
import type { DesktopCanvasArtifactView } from "@preload/api-types/canvas";
import {
	activityPanelTabByProjectAtom,
	canvasArtifactRevisionAtom,
	canvasUnreadCountAtom,
	chatMessagesAtom,
	confirmDialogAtom,
	focusInputRequestAtom,
	inputValueAtom,
	isCanvasTabVisible,
	openUrlInActivityWorkspaceAtom,
	pendingCanvasArtifactIdAtom,
	promptAttachmentAtom,
	resolvedThemeAtom,
	sessionDisplayLabel,
	sessionsMapAtom,
} from "@shared/store/atoms";
import { showToast } from "@shared/store/toast-atoms";
import type { TFunction } from "i18next";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActivityWorkspace } from "../registry/context";
import { groupCanvasArtifactsBySession, resolveCanvasSessionTitle } from "../services/canvas-artifact-groups";
import {
	type CanvasDataGridCellRange,
	type CanvasDataGridFormat,
	resolveCanvasDataGridFormat,
} from "../services/canvas-data-grid";
import { canvasHtmlDataUrl, classifyCanvasHtmlNavigation } from "../services/canvas-html-sandbox";
import { availableCanvasMacros, type CanvasMacroId, isCanvasPreviewEditable } from "../services/canvas-macros";
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
import {
	collectSessionChanges,
	type SessionChangeFile,
	sessionChangeCallsFromTimeline,
} from "../services/session-changes";

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
	/** 仅 `previewKind === "data-grid"` 时有值；其余预览类型为 null。 */
	readonly dataGridFormat: CanvasDataGridFormat | null;
	/** Markdown / 代码可就地编辑；HTML 走沙箱、data-grid 与缺失文件只读。 */
	readonly editable: boolean;
	readonly contentType?: string;
	readonly content: string;
	readonly extension: string;
	readonly htmlSrc?: string;
}

/**
 * 就地编辑视图。`baseVersion` 是进入编辑时的版本，保存只认这一个基线——
 * 期间 Agent 写了新版本，保存就会拿到 `stale_version`，而不是把草稿盖到新内容上。
 */
export interface CanvasEditorView {
	readonly baseVersion: number;
	readonly draft: string;
	readonly saving: boolean;
	/** 保存被拦截（基线落后）：草稿保留在编辑器里，等用户刷新或放弃。 */
	readonly staleVersion: boolean;
}

export interface CanvasMacroAction {
	readonly id: CanvasMacroId;
	readonly label: string;
	readonly icon: string;
}

/** Canvas Tab 内的一级分段：产物列表 / 任务变更（不新增第五个顶层 Tab）。 */
export type CanvasTabSection = "artifacts" | "changes";

/** 表格选区：文本摘录加「过滤 + 排序结果」中的行列范围（解析不到单元格时省略）。 */
export interface CanvasDataGridSelection {
	readonly text: string;
	readonly range?: CanvasDataGridCellRange;
}

export interface CanvasDataGridLabels {
	readonly table: string;
	readonly filterPlaceholder: string;
	readonly sortToAscending: string;
	readonly sortToDescending: string;
	readonly sortToDefault: string;
	readonly rowsPerPage: string;
	readonly previousPage: string;
	readonly nextPage: string;
	readonly empty: string;
	readonly noMatch: string;
	readonly pageSummary: (page: number, pageCount: number, rows: number) => string;
}

export interface CanvasTabModel {
	readonly loading: boolean;
	readonly empty: boolean;
	readonly emptyLabel: string;
	readonly emptyHint: string;
	readonly groups: readonly CanvasTabGroupView[];
	readonly selected: CanvasSelectedView | null;
	readonly selectionActionVisible: boolean;
	/** 非空即处于就地编辑态。 */
	readonly editor: CanvasEditorView | null;
	readonly macros: readonly CanvasMacroAction[];
	readonly section: CanvasTabSection;
	/** 当前会话累计的文件变更（只读投影，按文件收敛到最新一次差异）。 */
	readonly changeFiles: readonly SessionChangeFile[];
	readonly changeTotals: { readonly added: number; readonly removed: number };
	readonly selectedChange: SessionChangeFile | null;
	readonly theme: "light" | "dark";
	readonly labels: {
		readonly back: string;
		readonly open: string;
		readonly saveToProject: string;
		readonly openInBrowser: string;
		readonly delete: string;
		readonly selectToAsk: string;
		readonly missingFile: string;
		readonly missingFileHint: string;
		readonly externalUpdate: string;
		readonly externalUpdateHint: string;
		readonly htmlSandboxLabel: string;
		readonly groupBySession: string;
		readonly loading: string;
		readonly dataGrid: CanvasDataGridLabels;
		readonly enterEdit: string;
		readonly exitEdit: string;
		readonly save: string;
		readonly saving: string;
		readonly editorLabel: string;
		readonly staleVersion: string;
		readonly staleVersionHint: string;
		readonly reload: string;
		readonly saveFailed: string;
		readonly macrosLabel: string;
		readonly chart: { readonly empty: string; readonly chart: string };
		readonly checklist: {
			readonly empty: string;
			readonly done: string;
			readonly active: string;
			readonly todo: string;
		};
		readonly diff: {
			readonly empty: string;
			readonly expand: (path: string) => string;
			readonly collapse: (path: string) => string;
		};
		readonly invalidStructured: string;
		readonly sectionArtifacts: string;
		readonly sectionChanges: (count: number) => string;
		readonly changesEmpty: string;
		readonly changesEmptyHint: string;
		readonly statusAdded: string;
		readonly statusModified: string;
		readonly statusDeleted: string;
		readonly changeCount: (count: number) => string;
		readonly changePickHint: string;
		readonly saveAllToProject: string;
		readonly discardAll: string;
		readonly discardAllConfirm: (count: number) => string;
		readonly batchSaveSummary: (saved: number, conflicts: number, failed: number) => string;
		readonly batchDiscardSummary: (count: number) => string;
		readonly noArtifactsToSave: string;
	};
	readonly actions: {
		readonly open: (artifactId: string) => void;
		readonly back: () => void;
		readonly attachSelection: () => void;
		readonly saveToProject: () => void;
		readonly openInBrowser: () => void;
		readonly deleteSelected: () => void;
		readonly onPreviewSelectionChange: (target: EventTarget | null) => void;
		readonly onDataGridSelectionChange: (selection: CanvasDataGridSelection) => void;
		readonly onHtmlNavigation: (url: string) => void;
		readonly toggleEditing: () => void;
		readonly updateDraft: (value: string) => void;
		readonly saveDraft: () => void;
		readonly reloadSelected: () => void;
		readonly runMacro: (id: CanvasMacroId) => void;
		readonly selectSection: (section: CanvasTabSection) => void;
		readonly selectChange: (path: string) => void;
		readonly saveAllArtifacts: () => void;
		readonly discardAllArtifacts: () => void;
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
	const openUrlInWorkspace = useSetAtom(openUrlInActivityWorkspaceAtom);
	const revision = useAtomValue(canvasArtifactRevisionAtom);
	const setRevision = useSetAtom(canvasArtifactRevisionAtom);
	const setInputValue = useSetAtom(inputValueAtom);
	const setFocusInput = useSetAtom(focusInputRequestAtom);
	const pending = useAtomValue(pendingCanvasArtifactIdAtom);
	const setPendingId = useSetAtom(pendingCanvasArtifactIdAtom);
	const setUnread = useSetAtom(canvasUnreadCountAtom);
	const unread = useAtomValue(canvasUnreadCountAtom);
	const tabByProject = useAtomValue(activityPanelTabByProjectAtom);
	const canvasVisible = isCanvasTabVisible(tabByProject, [workspace.id, workspace.cwd]);

	const [items, setItems] = useState<readonly DesktopCanvasArtifactView[]>([]);
	const messages = useAtomValue(chatMessagesAtom);
	const [loading, setLoading] = useState(true);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [selected, setSelected] = useState<CanvasSelectedView | null>(null);
	const [selectionExcerpt, setSelectionExcerpt] = useState("");
	const [selectionRange, setSelectionRange] = useState<CanvasDataGridCellRange | undefined>(undefined);
	const [editor, setEditor] = useState<CanvasEditorView | null>(null);
	const [section, setSection] = useState<CanvasTabSection>("artifacts");
	const [selectedChangePath, setSelectedChangePath] = useState<string | null>(null);
	// items 的最新快照供选中态刷新读，不把它挂进 effect 依赖（避免列表刷新连带重取内容）。
	const itemsRef = useRef(items);
	itemsRef.current = items;

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
			if (kind === "data-grid") return t("activityPanel.canvas.kindDataGrid");
			if (kind === "chart") return t("activityPanel.canvas.kindChart");
			if (kind === "diff") return t("activityPanel.canvas.kindDiff");
			if (kind === "checklist") return t("activityPanel.canvas.kindChecklist");
			return t("activityPanel.canvas.kindMarkdown");
		},
		[t],
	);

	const macroLabels = useMemo<Record<CanvasMacroId, string>>(
		() => ({
			"add-comments": t("activityPanel.canvas.macros.addComments"),
			"add-logs": t("activityPanel.canvas.macros.addLogs"),
			"fix-bugs": t("activityPanel.canvas.macros.fixBugs"),
			"generate-tests": t("activityPanel.canvas.macros.generateTests"),
			"make-shorter": t("activityPanel.canvas.macros.makeShorter"),
			"make-longer": t("activityPanel.canvas.macros.makeLonger"),
			polish: t("activityPanel.canvas.macros.polish"),
		}),
		[t],
	);

	const macroPrompts = useMemo<Record<CanvasMacroId, string>>(
		() => ({
			"add-comments": t("activityPanel.canvas.macros.addCommentsPrompt"),
			"add-logs": t("activityPanel.canvas.macros.addLogsPrompt"),
			"fix-bugs": t("activityPanel.canvas.macros.fixBugsPrompt"),
			"generate-tests": t("activityPanel.canvas.macros.generateTestsPrompt"),
			"make-shorter": t("activityPanel.canvas.macros.makeShorterPrompt"),
			"make-longer": t("activityPanel.canvas.macros.makeLongerPrompt"),
			polish: t("activityPanel.canvas.macros.polishPrompt"),
		}),
		[t],
	);

	const macros = useMemo<readonly CanvasMacroAction[]>(
		() =>
			(selected ? availableCanvasMacros(selected.previewKind) : []).map((macro) => ({
				id: macro.id,
				label: macroLabels[macro.id],
				icon: macro.icon,
			})),
		[macroLabels, selected],
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

	const open = useCallback((artifactId: string) => {
		setSelectedId(artifactId);
		setSelectionExcerpt("");
		setSelectionRange(undefined);
		setEditor(null);
	}, []);

	// 打开中的 artifact 订阅 artifact revision 事件（TASK-0085 Phase2）：agent 写新版本时
	// 预览实时重取，不再只靠 mount/visibilitychange；refreshNonce 供 saveToProject 后强制重取。
	// t/kindLabel 经 ref 读取最新值——i18n mock 或语言切换会换函数引用，不能进 deps 否则每次渲染重取。
	const [refreshNonce, setRefreshNonce] = useState(0);
	const formatRef = useRef({ kindLabel, t });
	formatRef.current = { kindLabel, t };
	useEffect(() => {
		if (!selectedId) return;
		let cancelled = false;
		void revision;
		void refreshNonce;
		void (async () => {
			const result = await window.vetta.canvas.get({ workspaceId: workspace.id, artifactId: selectedId });
			if (cancelled) return;
			const { kindLabel: label, t: translate } = formatRef.current;
			if (!result.ok) {
				// get 失败意味着内容不可读（missing_file 等）；列表里的旧视图可能还记着
				// missing:false，这里以「读不到」为准，listed 只用于保留标题/kind 元数据。
				const listed = itemsRef.current.find((item) => item.descriptor.artifactId === selectedId);
				setSelected(
					listed
						? { ...toSelectedView(listed, "", label, translate), missing: true, content: "", htmlSrc: undefined }
						: {
								artifactId: selectedId,
								title: selectedId,
								version: 1,
								versionLabel: translate("activityPanel.canvas.version", { version: 1 }),
								kindLabel: label("markdown"),
								missing: true,
								externalUpdate: false,
								previewKind: "markdown",
								dataGridFormat: null,
								editable: false,

								content: "",
								extension: ".md",
							},
				);
				return;
			}
			setItems((current) => upsertView(current, result.view));
			setSelected(toSelectedView(result.view, result.content, label, translate));
		})();
		return () => {
			cancelled = true;
		};
	}, [selectedId, revision, refreshNonce, workspace.id]);

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
		setSelectionRange(undefined);
		setEditor(null);
		void reload();
	}, [reload]);

	// 追问与快捷宏共用同一个附件构造：选区文本 + 行列范围 + artifact 身份。
	const selectionAttachment = useCallback(() => {
		if (!selected || !selectionExcerpt) return null;
		const range = selectionRange ? formatCanvasDataGridRange(t, selectionRange) : "";
		const attachment = createCanvasSelectionAttachment({
			artifactId: selected.artifactId,
			version: selected.version,
			excerpt: selectionExcerpt,
			title: selected.title,
			kind: selected.previewKind,
			contentType: selected.contentType,
			// range 必须整体省略：PluginPromptContext 的 JSON 守卫会拒绝 undefined 值。
			...(range ? { range } : {}),
		});
		return { ...attachment, ownerPluginId: CANVAS_ATTACHMENT_OWNER_ID };
	}, [selected, selectionExcerpt, selectionRange, t]);

	const attachSelection = useCallback(() => {
		const attachment = selectionAttachment();
		if (!attachment) return;
		setPromptAttachment(attachment);
	}, [selectionAttachment, setPromptAttachment]);

	/** 宏操作 = 既有选区附件 + 预填的结构化指令，用户只需按发送。 */
	const runMacro = useCallback(
		(id: CanvasMacroId) => {
			const attachment = selectionAttachment();
			if (!attachment) return;
			setPromptAttachment(attachment);
			setInputValue(macroPrompts[id]);
			setFocusInput((previous) => previous + 1);
		},
		[macroPrompts, selectionAttachment, setFocusInput, setInputValue, setPromptAttachment],
	);

	const toggleEditing = useCallback(() => {
		if (!selected?.editable) return;
		if (editor) {
			setEditor(null);
			return;
		}
		// 基线只在进入编辑时取一次：期间 Agent 写了新版本，保存必须撞上 stale_version。
		setEditor({ baseVersion: selected.version, draft: selected.content, saving: false, staleVersion: false });
	}, [editor, selected]);

	const updateDraft = useCallback((value: string) => {
		setEditor((current) => (current ? { ...current, draft: value } : current));
	}, []);

	const reloadSelected = useCallback(() => {
		// 冲突后的显式刷新：结束编辑态并重取最新版本，编辑器不再保留旧草稿（提示文案已说明）。
		setEditor(null);
		setRevision((current) => current + 1);
	}, [setRevision]);

	const changes = useMemo(() => collectSessionChanges(sessionChangeCallsFromTimeline(messages)), [messages]);
	const selectedChange = useMemo(
		() => changes.files.find((file) => file.path === selectedChangePath) ?? null,
		[changes.files, selectedChangePath],
	);

	const selectSection = useCallback((next: CanvasTabSection) => {
		setSection(next);
		if (next !== "changes") setSelectedChangePath(null);
	}, []);

	const selectChange = useCallback((path: string) => {
		setSelectedChangePath((current) => (current === path ? null : path));
	}, []);

	// 批量保存复用既有 SAVE_TO_PROJECT 通道：目录只选一次，逐个写入并汇总冲突/失败。
	const saveAllArtifacts = useCallback(() => {
		const targets = items.filter((item) => !item.missing);
		if (targets.length === 0) {
			showToast({ variant: "warning", message: t("activityPanel.canvas.noArtifactsToSave") });
			return;
		}
		void (async () => {
			const folder = await window.vetta.dialog.selectFolder();
			if (!folder) return;
			let saved = 0;
			let conflicts = 0;
			let failed = 0;
			for (const item of targets) {
				const fileName = suggestedCanvasSaveFileName({
					title: item.descriptor.title,
					contentType: item.descriptor.contentType,
					uri: item.descriptor.uri,
				});
				const result = await window.vetta.canvas.saveToProject({
					workspaceId: workspace.id,
					artifactId: item.descriptor.artifactId,
					targetPath: joinCanvasTargetPath(folder, fileName),
				});
				if (result.ok) saved += 1;
				else if (result.code === "conflict") conflicts += 1;
				else failed += 1;
			}
			showToast({
				variant: conflicts > 0 || failed > 0 ? "warning" : "success",
				message: t("activityPanel.canvas.batchSaveSummary", { saved, conflicts, failed }),
			});
			setRevision((current) => current + 1);
		})();
	}, [items, setRevision, t, workspace.id]);

	// 放弃全部产物 = 清空画布列表（走既有 DELETE，带确认框）；会话历史与项目文件不动。
	const discardAllArtifacts = useCallback(() => {
		if (items.length === 0) return;
		setConfirm({
			title: t("activityPanel.canvas.discardAll"),
			message: t("activityPanel.canvas.discardAllConfirm", { count: items.length }),
			confirmLabel: t("activityPanel.canvas.discardAll"),
			cancelLabel: tCommon("actions.cancel"),
			variant: "danger",
			onConfirm: () => {
				setConfirm(null);
				void (async () => {
					let removed = 0;
					for (const item of items) {
						const result = await window.vetta.canvas.delete({
							workspaceId: workspace.id,
							artifactId: item.descriptor.artifactId,
						});
						if (result.ok) removed += 1;
					}
					setItems([]);
					setSelectedId(null);
					setSelected(null);
					setEditor(null);
					showToast({
						variant: "success",
						message: t("activityPanel.canvas.batchDiscardSummary", { count: removed }),
					});
				})();
			},
			onCancel: () => setConfirm(null),
		});
	}, [items, setConfirm, t, tCommon, workspace.id]);

	const saveDraft = useCallback(() => {
		if (!editor || !selected || editor.saving) return;
		const baseVersion = editor.baseVersion;
		const content = editor.draft;
		setEditor((current) => (current ? { ...current, saving: true } : current));
		void (async () => {
			const result = await window.vetta.canvas.update({
				workspaceId: workspace.id,
				artifactId: selected.artifactId,
				baseVersion,
				content,
				title: selected.title,
			});
			if (!result.ok) {
				if (result.code === "stale_version") {
					// 不写入、不丢草稿：保留编辑器内容，只提示冲突并给刷新入口。
					setEditor((current) => (current ? { ...current, saving: false, staleVersion: true } : current));
					return;
				}
				setEditor((current) => (current ? { ...current, saving: false } : current));
				showToast({ variant: "error", message: t("activityPanel.canvas.saveFailed") });
				return;
			}
			setEditor(null);
			// 版本已前进：递增 revision 让列表与预览重取内容；历史版本文件由 store 保留。
			setRevision((current) => current + 1);
		})();
	}, [editor, selected, setRevision, t, workspace.id]);

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
				setRefreshNonce((nonce) => nonce + 1);
			}
		})();
	}, [items, selected, selectedId, t, workspace.id]);

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

	const openInBrowser = useCallback(() => {
		if (!selected || selected.missing || selected.previewKind !== "html") return;
		void (async () => {
			const result = await window.vetta.canvas.openInBrowser({
				workspaceId: workspace.id,
				artifactId: selected.artifactId,
			});
			if (!result.ok) {
				showToast({ variant: "error", message: t("activityPanel.canvas.openInBrowserFailed") });
				return;
			}
			// 切 Tab、展开面板与写入地址都交给既有原子，本处只把回环地址递过去。
			openUrlInWorkspace({ workspaceId: workspace.id, url: result.url });
		})();
	}, [openUrlInWorkspace, selected, t, workspace.id]);

	const onPreviewSelectionChange = useCallback((target: EventTarget | null) => {
		setSelectionExcerpt(readCanvasSelectionFromTarget(target));
		setSelectionRange(undefined);
	}, []);

	// 表格预览是「单元格选区」而不是可滚动文本节点，行列范围由组件从 DOM 解出后一起回传。
	const onDataGridSelectionChange = useCallback((selection: CanvasDataGridSelection) => {
		setSelectionExcerpt(selection.text);
		setSelectionRange(selection.text ? selection.range : undefined);
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
		editor,
		macros,
		section,
		changeFiles: changes.files,
		changeTotals: { added: changes.added, removed: changes.removed },
		selectedChange,
		theme,
		labels: {
			back: tCommon("actions.back"),
			open: t("activityPanel.canvas.open"),
			saveToProject: t("activityPanel.canvas.saveToProject"),
			openInBrowser: t("activityPanel.canvas.openInBrowser"),
			delete: t("activityPanel.canvas.delete"),
			selectToAsk: t("activityPanel.canvas.selectToAsk"),
			missingFile: t("activityPanel.canvas.missingFile"),
			missingFileHint: t("activityPanel.canvas.missingFileHint"),
			externalUpdate: t("activityPanel.canvas.externalUpdate"),
			externalUpdateHint: t("activityPanel.canvas.externalUpdateHint"),
			htmlSandboxLabel: t("activityPanel.canvas.htmlSandboxLabel"),
			groupBySession: t("activityPanel.canvas.groupBySession"),
			loading: t("activityPanel.canvas.loading"),
			dataGrid: {
				table: t("activityPanel.canvas.dataGrid.table"),
				filterPlaceholder: t("activityPanel.canvas.dataGrid.filterPlaceholder"),
				sortToAscending: t("activityPanel.canvas.dataGrid.sortToAscending"),
				sortToDescending: t("activityPanel.canvas.dataGrid.sortToDescending"),
				sortToDefault: t("activityPanel.canvas.dataGrid.sortToDefault"),
				rowsPerPage: t("activityPanel.canvas.dataGrid.rowsPerPage"),
				previousPage: t("activityPanel.canvas.dataGrid.previousPage"),
				nextPage: t("activityPanel.canvas.dataGrid.nextPage"),
				empty: t("activityPanel.canvas.dataGrid.empty"),
				noMatch: t("activityPanel.canvas.dataGrid.noMatch"),
				pageSummary: (page, pageCount, rows) =>
					t("activityPanel.canvas.dataGrid.pageSummary", { page, pageCount, rows }),
			},
			enterEdit: t("activityPanel.canvas.enterEdit"),
			exitEdit: t("activityPanel.canvas.exitEdit"),
			save: t("activityPanel.canvas.save"),
			saving: t("activityPanel.canvas.savingLabel"),
			editorLabel: t("activityPanel.canvas.editorLabel"),
			staleVersion: t("activityPanel.canvas.staleVersion"),
			staleVersionHint: t("activityPanel.canvas.staleVersionHint"),
			reload: t("activityPanel.canvas.reload"),
			saveFailed: t("activityPanel.canvas.saveFailed"),
			macrosLabel: t("activityPanel.canvas.macrosLabel"),
			chart: { empty: t("activityPanel.canvas.chartEmpty"), chart: t("activityPanel.canvas.kindChart") },
			checklist: {
				empty: t("activityPanel.canvas.checklistEmpty"),
				done: t("activityPanel.canvas.checklistDone"),
				active: t("activityPanel.canvas.checklistActive"),
				todo: t("activityPanel.canvas.checklistTodo"),
			},
			diff: {
				empty: t("activityPanel.canvas.diffEmpty"),
				expand: (path) => t("activityPanel.canvas.diffExpand", { path }),
				collapse: (path) => t("activityPanel.canvas.diffCollapse", { path }),
			},
			invalidStructured: t("activityPanel.canvas.invalidStructured"),
			sectionArtifacts: t("activityPanel.canvas.sectionArtifacts"),
			sectionChanges: (count) => t("activityPanel.canvas.sectionChanges", { count }),
			changesEmpty: t("activityPanel.canvas.changesEmpty"),
			changesEmptyHint: t("activityPanel.canvas.changesEmptyHint"),
			statusAdded: t("activityPanel.canvas.statusAdded"),
			statusModified: t("activityPanel.canvas.statusModified"),
			statusDeleted: t("activityPanel.canvas.statusDeleted"),
			changeCount: (count) => t("activityPanel.canvas.changeCount", { count }),
			changePickHint: t("activityPanel.canvas.changePickHint"),
			saveAllToProject: t("activityPanel.canvas.saveAllToProject"),
			discardAll: t("activityPanel.canvas.discardAll"),
			discardAllConfirm: (count) => t("activityPanel.canvas.discardAllConfirm", { count }),
			batchSaveSummary: (saved, conflicts, failed) =>
				t("activityPanel.canvas.batchSaveSummary", { saved, conflicts, failed }),
			batchDiscardSummary: (count) => t("activityPanel.canvas.batchDiscardSummary", { count }),
			noArtifactsToSave: t("activityPanel.canvas.noArtifactsToSave"),
		},
		actions: {
			open,
			back,
			attachSelection,
			saveToProject,
			openInBrowser,
			deleteSelected,
			onPreviewSelectionChange,
			onDataGridSelectionChange,
			onHtmlNavigation,
			toggleEditing,
			updateDraft,
			saveDraft,
			reloadSelected,
			runMacro,
			selectSection,
			selectChange,
			saveAllArtifacts,
			discardAllArtifacts,
		},
	};
}

function formatCanvasTime(value: number): string {
	return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(value);
}

/** 行列范围摘要：单行 / 单列不显示区间，避免出现「第 3-3 行」。 */
function formatCanvasDataGridRange(t: TFunction<"chat">, range: CanvasDataGridCellRange): string {
	const rows =
		range.rowStart === range.rowEnd
			? t("activityPanel.canvas.dataGrid.rangeRow", { index: range.rowStart })
			: t("activityPanel.canvas.dataGrid.rangeRows", { from: range.rowStart, to: range.rowEnd });
	const columns =
		range.columnStart === range.columnEnd
			? t("activityPanel.canvas.dataGrid.rangeColumn", { index: range.columnStart })
			: t("activityPanel.canvas.dataGrid.rangeColumns", { from: range.columnStart, to: range.columnEnd });
	return `${rows} · ${columns}`;
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
		dataGridFormat: previewKind === "data-grid" ? resolveCanvasDataGridFormat(view.descriptor) : null,
		editable: !view.missing && isCanvasPreviewEditable(previewKind),
		contentType: view.descriptor.contentType,
		content: view.missing ? "" : content,
		extension: canvasPreviewExtension(view.descriptor),
		htmlSrc: !view.missing && previewKind === "html" ? canvasHtmlDataUrl(content) : undefined,
	};
}
