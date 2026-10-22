// Modified by The Open Forge contributors.
import { useBatchTasks } from "@domains/batch-tasks/hooks/useBatchTasks";
import { isDuplicateProjectName } from "@shared/lib/project-name";
import { pathBasename } from "@shared/lib/utils";
import { confirmDialogAtom, migrationImportWizardAtom, projectsAtom } from "@shared/store/atoms";
import { useNavigate } from "@tanstack/react-router";
import { getDefaultStore, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProjectActions } from "../../../hooks/useProjects";
import { previewProjectMigrationArchive } from "../../../services/session-archive";
import type { AddProjectMenuItemModel } from "./types";

export function useAddProjectMenuModel(): {
	items: AddProjectMenuItemModel[];
	menuRef: React.RefObject<HTMLDivElement | null>;
	open: boolean;
	showNewProject: boolean;
	closeNewProjectDialog: () => void;
	confirmNewProject: (name: string) => void;
	showRemotePicker: boolean;
	closeRemotePicker: () => void;
	confirmRemoteProject: (hostId: string, remotePath: string, name?: string) => void;
	isProjectNameTaken: (name: string) => boolean;
	toggleOpen: () => void;
} {
	const { t } = useTranslation("project");
	// 判重只在点确认时读一次项目列表：这里刻意不订阅 projectsAtom，保持菜单模型零订阅面。
	const store = getDefaultStore();
	const { createProject, openProject, openProjectPath, refreshProjects } = useProjectActions();
	const { refreshProjects: refreshBatchProjects } = useBatchTasks();
	const setConfirm = useSetAtom(confirmDialogAtom);
	const setMigrationImportWizard = useSetAtom(migrationImportWizardAtom);
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [showNewProject, setShowNewProject] = useState(false);
	const [showRemotePicker, setShowRemotePicker] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);

	/**
	 * 「导入项目」选中 `.ofar`（会话归档 / 项目迁移包）后的分流（BUG-0143）：
	 * 归档与 zip 项目包的导入语义不同——先问口令，再看包版本。
	 * - v2 迁移包：交给全局迁移向导（目标位置 / 冲突策略 / 报告）；
	 * - v1 会话归档：只在这里给出「去会话页导入」的指引，真正通道的语义不动。
	 */
	const openMigrationArchive = (archivePath: string): void => {
		const name = pathBasename(archivePath);
		setConfirm({
			title: t("importDialog.migrationTitle"),
			message: t("importDialog.migrationMessage", { name }),
			confirmLabel: t("importDialog.migrationConfirm"),
			cancelLabel: t("importDialog.gotIt"),
			input: { password: true, label: t("importDialog.migrationPassphraseLabel") },
			onConfirm: (_checkboxChecked: boolean, passphrase = "") => {
				void (async () => {
					try {
						const preview = await previewProjectMigrationArchive(passphrase, { archivePath });
						if (preview.canceled) return;
						if (preview.classic) {
							setConfirm({
								title: t("importDialog.classicTitle"),
								message: t("importDialog.classicMessage", { name }),
								confirmLabel: t("importDialog.gotIt"),
								onConfirm: () => {},
							});
							return;
						}
						setMigrationImportWizard({
							preview: {
								archivePath: preview.archivePath,
								sourceCwd: preview.sourceCwd,
								sessionCount: preview.sessionCount,
								sessions: preview.sessions,
								workspaceFileCount: preview.workspaceFileCount,
								workspaceBytes: preview.workspaceBytes,
								formatVersion: preview.formatVersion,
							},
							passphrase,
						});
					} catch (error) {
						setConfirm({
							title: t("importDialog.failedTitle"),
							message: error instanceof Error ? error.message : String(error),
							confirmLabel: t("importDialog.failedConfirm"),
							variant: "danger",
							onConfirm: () => {},
						});
					}
				})();
			},
		});
	};

	const handleImport = async (): Promise<void> => {
		setOpen(false);
		const result = await window.vetta.project.import();
		if (!result) return;
		if ("error" in result) {
			setConfirm({
				title: t("importDialog.failedTitle"),
				message: result.error.message,
				confirmLabel: t("importDialog.failedConfirm"),
				variant: "danger",
				onConfirm: () => {},
			});
			return;
		}
		// `.ofar` 不是项目包：主进程只回传路径，不落盘也不登记项目。
		if ("kind" in result) {
			openMigrationArchive(result.archivePath);
			return;
		}
		await Promise.all([refreshProjects(), refreshBatchProjects()]).catch(() => {});
		const missing = result.missingSources;
		const onJump = (): void => {
			void navigate({
				to: "/project/$cwd",
				params: { cwd: encodeURIComponent(result.path) },
			});
		};
		if (missing && missing.length > 0) {
			const more = missing.length > 8 ? t("importDialog.partialMore", { count: missing.length - 8 }) : "";
			const list = missing.slice(0, 8).join("\n") + more;
			setConfirm({
				title: t("importDialog.partialTitle"),
				message: t("importDialog.partialMessage", {
					name: result.name,
					count: missing.length,
					list,
				}),
				confirmLabel: t("importDialog.viewProject"),
				cancelLabel: t("importDialog.gotIt"),
				variant: "default",
				onConfirm: onJump,
			});
			return;
		}
		setConfirm({
			title: t("importDialog.doneTitle"),
			message: t("importDialog.doneMessage", { name: result.name }),
			confirmLabel: t("importDialog.viewProject"),
			cancelLabel: t("importDialog.gotIt"),
			variant: "default",
			onConfirm: onJump,
		});
	};

	useEffect(() => {
		if (!open) return;
		function handleClick(e: MouseEvent): void {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [open]);

	return {
		items: [
			{
				action: "newProject",
				icon: "icon-[solar--add-folder-linear]",
				labelKey: "actions.newProject",
				onSelect: () => {
					setOpen(false);
					setShowNewProject(true);
				},
			},
			{
				action: "openProject",
				icon: "icon-[solar--folder-open-linear]",
				labelKey: "actions.openProject",
				onSelect: () => {
					setOpen(false);
					void openProject();
				},
			},
			{
				action: "addFromRemoteHost",
				icon: "icon-[solar--server-linear]",
				labelKey: "actions.addFromRemoteHost",
				onSelect: () => {
					setOpen(false);
					setShowRemotePicker(true);
				},
			},
			{
				action: "importProject",
				icon: "icon-[solar--import-linear]",
				labelKey: "actions.importProject",
				onSelect: () => {
					void handleImport();
				},
			},
		],
		menuRef,
		open,
		showNewProject,
		closeNewProjectDialog: () => setShowNewProject(false),
		isProjectNameTaken: (name: string) =>
			isDuplicateProjectName(
				name,
				store
					.get(projectsAtom)
					.map((project) => project.name)
					.filter((name): name is string => Boolean(name)),
			),
		confirmNewProject: (name: string) => {
			setShowNewProject(false);
			void createProject(name);
		},
		showRemotePicker,
		closeRemotePicker: () => setShowRemotePicker(false),
		confirmRemoteProject: (hostId: string, remotePath: string, name?: string) => {
			setShowRemotePicker(false);
			// 远程项目的标识是 ssh URI；登记走与本地项目同一个服务，校验和广播才一致。
			void openProjectPath(`ssh://${hostId}${remotePath}`, name).catch((error: unknown) => {
				// 主机被删掉、选中的目录其实是文件——这些都要说清楚，否则用户只会看到
				// 对话框关了但项目没出现。
				setConfirm({
					title: t("remotePicker.failedTitle"),
					message: error instanceof Error ? error.message : String(error),
					variant: "danger",
					onConfirm: () => {},
				});
			});
		},
		toggleOpen: () => setOpen((value) => !value),
	};
}
