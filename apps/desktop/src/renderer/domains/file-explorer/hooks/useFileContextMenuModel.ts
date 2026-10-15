// Modified by The Open Forge contributors.
import type { FileExplorerEntryKind } from "@preload/fs-types";
import { isMac } from "@shared/lib/platform";
import { pathDirname } from "@shared/lib/utils";
import { type FsEntry, pluginFileExplorerContextMenuActionsAtom, renamingPathAtom } from "@shared/store/atoms";
import { isSshProjectUri } from "@vetta/ssh-transport/project-uri";
import type { FileContextMenuPluginAction, FileContextMenuViewProps } from "@vetta-org/theme-ui/file-explorer";
import { useAtomValue, useSetAtom } from "jotai";
import { createElement, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getPluginFileExplorerWorkspaceRoots } from "../../plugins/runtime/plugin-file-explorer-host";
import { PluginInlineI18nBoundary, usePluginTextResolver } from "../../plugins/runtime/plugin-i18n";
import { matchesFileExplorerWhen, sortFileExplorerActions } from "../services/plugin-contributions";

export function useFileContextMenuModel(input: {
	entry: FsEntry;
	isRoot: boolean;
	targetEntries: readonly FsEntry[];
	canPaste: boolean;
	onClose: () => void;
	onDelete: (entries: readonly FsEntry[]) => void;
	onCreate: (kind: FileExplorerEntryKind, parentDirectory: string) => void;
	onCopy: (entries: readonly FsEntry[]) => void;
	onPaste: () => void;
	onCopyPath: (entries: readonly FsEntry[]) => void;
	/** 仅 SSH 工作区提供：把选中条目下载到本机选择的目录。 */
	onSshDownload?: (entries: readonly FsEntry[]) => void;
	/** 仅 SSH 工作区提供：向该目录（entry.path 即 ssh:// URI）上传本机文件/文件夹。 */
	onSshUpload?: (destinationUri: string, kind: "file" | "directory") => void;
}): FileContextMenuViewProps {
	const { t } = useTranslation("chat");
	const setRenamingPath = useSetAtom(renamingPathAtom);
	const pluginActions = useAtomValue(pluginFileExplorerContextMenuActionsAtom);
	const resolvePluginText = usePluginTextResolver();
	const { entry, isRoot, targetEntries, canPaste, onClose } = input;
	const singleTarget = targetEntries.length === 1 ? (targetEntries[0] ?? entry) : entry;
	const canRename = !isRoot && targetEntries.length === 1;

	const onOpenInFolder = useCallback(() => {
		const target = isRoot ? entry : singleTarget;
		if (target.isDirectory) {
			void window.vetta.shell.showInFolder(target.path);
		} else {
			void window.vetta.shell.showItemInFolder(target.path);
		}
		onClose();
	}, [entry, isRoot, singleTarget, onClose]);

	const onCopyName = useCallback(() => {
		const text = targetEntries.map((item) => item.name).join("\n");
		void navigator.clipboard.writeText(text);
		onClose();
	}, [targetEntries, onClose]);

	const onCopyPath = useCallback(() => {
		input.onCopyPath(targetEntries);
		onClose();
	}, [input, targetEntries, onClose]);

	const onCopy = useCallback(() => {
		input.onCopy(targetEntries);
		onClose();
	}, [input, targetEntries, onClose]);

	const onPaste = useCallback(() => {
		input.onPaste();
		onClose();
	}, [input, onClose]);

	const onRename = useCallback(() => {
		if (!canRename) return;
		setRenamingPath(singleTarget.path);
		onClose();
	}, [canRename, singleTarget.path, onClose, setRenamingPath]);

	const handleDelete = useCallback(() => {
		input.onDelete(targetEntries);
	}, [input, targetEntries]);

	const handleCreate = useCallback(
		(kind: FileExplorerEntryKind) => {
			// Root menu always creates under workspace root; entry menus use dir or parent of file.
			const parentDirectory = isRoot || entry.isDirectory ? entry.path : pathDirname(entry.path);
			onClose();
			input.onCreate(kind, parentDirectory);
		},
		[entry, input, isRoot, onClose],
	);

	// SSH 工作区的传输入口：条目菜单给「下载」，目录（含根）菜单再给「上传」。
	const transferActions = useMemo(() => {
		if (!isSshProjectUri(entry.path)) return [];
		const actions: FileContextMenuPluginAction[] = [];
		if (input.onSshDownload && !isRoot) {
			actions.push({
				id: "ssh-transfer-download",
				label: t("fileExplorer.sshTransfer.download"),
				icon: createElement("span", { className: "icon-[solar--download-linear] h-3.5 w-3.5" }),
				onSelect: () => {
					onClose();
					input.onSshDownload?.(targetEntries);
				},
			});
		}
		if (input.onSshUpload && (isRoot || entry.isDirectory)) {
			const destinationUri = entry.path;
			const upload = (kind: "file" | "directory", id: string, label: string): FileContextMenuPluginAction => ({
				id,
				label,
				icon: createElement("span", { className: "icon-[solar--export-linear] h-3.5 w-3.5" }),
				onSelect: () => {
					onClose();
					input.onSshUpload?.(destinationUri, kind);
				},
			});
			actions.push(upload("file", "ssh-transfer-upload-files", t("fileExplorer.sshTransfer.uploadFiles")));
			actions.push(upload("directory", "ssh-transfer-upload-folders", t("fileExplorer.sshTransfer.uploadFolders")));
		}
		return actions;
	}, [entry.isDirectory, entry.path, isRoot, onClose, t, targetEntries, input.onSshDownload, input.onSshUpload]);

	const resolvedPluginActions = useMemo(
		() =>
			isRoot
				? []
				: sortFileExplorerActions(pluginActions)
						.filter((action) => matchesFileExplorerWhen(entry, action.when))
						.map((action) => ({
							id: action.actionId,
							label: resolvePluginText(action.pluginId, action.label),
							icon: action.icon
								? createElement(PluginInlineI18nBoundary, { pluginId: action.pluginId }, action.icon)
								: undefined,
							onSelect: () => {
								onClose();
								void Promise.resolve(
									action.run({
										entry: { ...entry },
										workspaceRoot: getPluginFileExplorerWorkspaceRoots()[0] ?? null,
									}),
								).catch((error: unknown) => {
									console.error(`Plugin ${action.pluginId} file explorer action failed`, error);
								});
							},
						})),
		[entry, isRoot, onClose, pluginActions, resolvePluginText],
	);

	return {
		x: 0,
		y: 0,
		labels: {
			newFile: t("fileExplorer.newFile"),
			newFolder: t("fileExplorer.newFolder"),
			openInFolder: isMac ? t("fileExplorer.openInFinder") : t("fileExplorer.openInExplorer"),
			copy: t("fileExplorer.copy"),
			paste: t("fileExplorer.paste"),
			copyPath: t("fileExplorer.copyPath"),
			copyName: t("fileExplorer.copyName"),
			rename: t("fileExplorer.rename"),
			delete: t("fileExplorer.delete"),
		},
		onClose,
		onCreateFile: () => handleCreate("file"),
		onCreateFolder: () => handleCreate("directory"),
		onOpenInFolder,
		onCopy,
		onPaste,
		onCopyPath,
		onCopyName,
		onRename,
		onDelete: handleDelete,
		showEntryActions: !isRoot,
		canPaste,
		canRename,
		// 远端文件在这台电脑上没有对应的位置，系统文件管理器无从显示。
		canOpenInFolder: !isSshProjectUri(entry.path),
		transferActions,
		pluginActions: resolvedPluginActions,
	};
}
