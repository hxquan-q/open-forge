// Modified by The Open Forge contributors.
import type { SshTransferConflictPolicy, SshTransferItem, SshTransferPlan } from "@preload/api-types/ssh-transfers";
import { confirmDialogAtom, type FsEntry } from "@shared/store/atoms";
import { formatSshProjectUri, isSshProjectUri } from "@vetta/ssh-transport/project-uri";
import { useSetAtom } from "jotai";
import { createElement, type ReactNode, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SshTransferProgressPanel } from "../components/SshTransferProgressPanel";

/**
 * SSH 工作区的文件传输编排（本机 ↔ ssh:// 项目目录）。
 *
 * plan 是只读探测（展开文件夹、标记目标冲突），commit 扔进主进程队列。
 * 有冲突时弹全局确认框：确认=替换、取消=跳过冲突项继续传——服务不自行裁断。
 * 进度事件在渲染侧镜像一份驱动右下角浮层；上传结束后刷新受影响的远端目录。
 */
export function useSshFileTransfers(input: {
	rootDir: string | null;
	refreshDir: (path: string) => Promise<void> | void;
	setErrorToast: (message: string) => void;
}): {
	items: SshTransferItem[];
	panel: ReactNode;
	handleSshDownload: (entries: readonly FsEntry[]) => void;
	handleSshUpload: (destinationUri: string, kind: "file" | "directory") => void;
	handleSshUploadPaths: (localPaths: readonly string[], destinationUri: string) => void;
} {
	const { t } = useTranslation("chat");
	const setConfirm = useSetAtom(confirmDialogAtom);
	const [items, setItems] = useState<SshTransferItem[]>([]);
	const { rootDir, refreshDir, setErrorToast } = input;

	const commitSshPlan = useCallback(
		(plan: SshTransferPlan) => {
			// plan 阶段就进不了队列的源（缺失/超上限等）先告知，再决定入队部分。
			if (plan.skipped.length > 0) {
				setErrorToast(t("fileExplorer.sshTransfer.skippedCount", { count: plan.skipped.length }));
			}
			const commit = (policy: SshTransferConflictPolicy) => {
				void window.vetta.ssh
					.commitTransfer(plan.id, policy)
					.then((items) => {
						if (items.length === 0) {
							setErrorToast(t("fileExplorer.sshTransfer.nothingToTransfer"));
						}
					})
					.catch((error: unknown) => {
						setErrorToast(error instanceof Error ? error.message : t("fileExplorer.sshTransfer.startFailed"));
					});
			};
			const conflictCount = plan.groups.reduce(
				(sum, group) => sum + group.entries.filter((entry) => entry.conflict).length,
				0,
			);
			if (conflictCount === 0) {
				commit("replace");
				return;
			}
			// 有同名目标时不静默覆盖：确认=替换，取消=跳过冲突项继续传。
			setConfirm({
				title: t("fileExplorer.sshTransfer.conflictTitle"),
				message: t("fileExplorer.sshTransfer.conflictMessage", { count: conflictCount }),
				confirmLabel: t("fileExplorer.sshTransfer.replace"),
				cancelLabel: t("fileExplorer.sshTransfer.skip"),
				onConfirm: () => commit("replace"),
				onCancel: () => commit("skip"),
			});
		},
		[setConfirm, setErrorToast, t],
	);

	const handleSshDownload = useCallback(
		(entries: readonly FsEntry[]) => {
			if (entries.length === 0) return;
			void (async () => {
				try {
					const localDir = await window.vetta.ssh.selectTransferDownloadDir();
					if (!localDir) return;
					const plan = await window.vetta.ssh.planTransfer({
						direction: "download",
						remoteUris: entries.map((entry) => entry.path),
						localDir,
					});
					commitSshPlan(plan);
				} catch (error: unknown) {
					console.warn("[file-explorer] ssh download plan failed", error);
					setErrorToast(error instanceof Error ? error.message : t("fileExplorer.sshTransfer.startFailed"));
				}
			})();
		},
		[commitSshPlan, t, setErrorToast],
	);

	const handleSshUpload = useCallback(
		(destinationUri: string, kind: "file" | "directory") => {
			void (async () => {
				try {
					const localPaths = await window.vetta.ssh.selectTransferSource(kind);
					if (localPaths.length === 0) return;
					const plan = await window.vetta.ssh.planTransfer({
						direction: "upload",
						remoteDirUri: destinationUri,
						localPaths,
					});
					commitSshPlan(plan);
				} catch (error: unknown) {
					console.warn("[file-explorer] ssh upload plan failed", error);
					setErrorToast(error instanceof Error ? error.message : t("fileExplorer.sshTransfer.startFailed"));
				}
			})();
		},
		[commitSshPlan, t, setErrorToast],
	);

	const handleSshUploadPaths = useCallback(
		(localPaths: readonly string[], destinationUri: string) => {
			if (localPaths.length === 0) return;
			void (async () => {
				try {
					const plan = await window.vetta.ssh.planTransfer({
						direction: "upload",
						remoteDirUri: destinationUri,
						localPaths: [...localPaths],
					});
					commitSshPlan(plan);
				} catch (error: unknown) {
					console.warn("[file-explorer] ssh upload plan failed", error);
					setErrorToast(error instanceof Error ? error.message : t("fileExplorer.sshTransfer.startFailed"));
				}
			})();
		},
		[commitSshPlan, setErrorToast, t],
	);

	// 事件流镜像 + 完成后刷新：上传落盘后让远端树里的目标目录重新列举。
	const isRemoteWorkspace = rootDir != null && isSshProjectUri(rootDir);

	useEffect(() => {
		if (!isRemoteWorkspace) return;
		return window.vetta.ssh.onTransferEvent((event) => {
			if (event.type === "removed") {
				const removedId = event.id;
				if (removedId) setItems((current) => current.filter((entry) => entry.id !== removedId));
				return;
			}
			const item = event.item;
			if (!item) return;
			setItems((current) => {
				const index = current.findIndex((entry) => entry.id === item.id);
				if (index < 0) return [item, ...current];
				const next = [...current];
				next[index] = item;
				return next;
			});
			if (
				item.direction === "upload" &&
				(item.status === "completed" || item.status === "failed" || item.status === "canceled")
			) {
				const parentPath = item.remotePath.slice(0, item.remotePath.lastIndexOf("/")) || "/";
				const parentUri = formatSshProjectUri(item.hostId, parentPath);
				// 受影响目录在可见树内才刷新；树根本身或其子目录收到新文件时重列举。
				if (rootDir && (parentUri === rootDir || parentUri.startsWith(`${rootDir}/`))) {
					void refreshDir(parentUri);
				}
			}
		});
	}, [isRemoteWorkspace, refreshDir, rootDir]);

	const panel =
		items.length > 0
			? createElement(SshTransferProgressPanel, {
					items,
					onCancel: (id: string) => {
						void window.vetta.ssh.cancelTransfer(id).catch(() => undefined);
					},
					onRemove: (id: string) => {
						void window.vetta.ssh.removeTransfer(id).catch(() => undefined);
					},
				})
			: null;

	return { items, panel, handleSshDownload, handleSshUpload, handleSshUploadPaths };
}
