// Modified by The Open Forge contributors.
import type { SessionContextMenuSession } from "@shared/store/atoms";
import {
	confirmDialogAtom,
	conversationFilterSource,
	projectContextMenuAtom,
	runningSessionPathsAtom,
	sessionContextMenuAtom,
	sessionDisplayLabel,
} from "@shared/store/atoms";
import { showToast } from "@shared/store/toast-atoms";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import type { ProjectsPanelModel } from "../components/sidebar/projects/panel/types";
import { exportPortableProjectSessionArchive, exportProjectMigrationPackage } from "../services/session-archive";

export function useProjectsPanelMenusModel(model: ProjectsPanelModel) {
	const [contextMenu, setContextMenu] = useAtom(sessionContextMenuAtom);
	const [projectMenu, setProjectMenu] = useAtom(projectContextMenuAtom);
	const runningSessionPaths = useAtomValue(runningSessionPathsAtom);
	const setConfirm = useSetAtom(confirmDialogAtom);
	const { t } = useTranslation("project");

	const clearConversationDisabled =
		projectMenu?.project.isDefault === true &&
		model.projectSessions(projectMenu.project.cwd).some((session) => runningSessionPaths.has(session.path));

	const clearClawDisabled =
		projectMenu?.project.isDefault === true &&
		model.projectSessions(model.imCwd).some((session) => runningSessionPaths.has(session.path));
	// 项目右键菜单只区分「清空会话 / 清空 Claw」，标签档按其所属来源（对话）处理。
	const defaultScope =
		projectMenu?.project.isDefault === true ? conversationFilterSource(model.defaultConversationFilter) : undefined;

	return {
		contextMenu,
		projectMenu,
		clearConversationDisabled,
		clearClawDisabled,
		defaultScope,
		actions: {
			closeSessionMenu: () => setContextMenu(null),
			closeProjectMenu: () => setProjectMenu(null),
			deleteSession: (session: SessionContextMenuSession) => {
				setContextMenu(null);
				const name = isAgentTeamSession(session) ? session.sessionTitle : sessionDisplayLabel(session);
				setConfirm({
					title: t("sidebar.dialogs.deleteSessionTitle"),
					message: t("sidebar.dialogs.deleteSessionMessage", { name }),
					confirmLabel: t("sidebar.dialogs.deleteConfirm"),
					variant: "danger",
					onConfirm: () => {
						// 会话没了，它留下的标注与归档标记就是孤儿；与置顶的清理时机保持一致。
						void window.vetta.conversationTags.forgetConversations([session.path]);
						void window.vetta.archivedSessions.forget([session.path]);
						model.actions.deleteSession(session);
					},
				});
			},
			archiveProject: (cwd: string) => {
				setProjectMenu(null);
				model.actions.archiveProject(cwd);
			},
			exportProjectSessions: (cwd: string, projectName?: string) => {
				setProjectMenu(null);
				// 项目归档口令与单会话导出一致：确认对话框输入，可留空；结果走 Toast，
				// 不再用阻塞式原生提示。
				setConfirm({
					title: t("contextMenu.exportSessions"),
					message: t("projectExport.passphrasePrompt"),
					input: { password: true },
					onConfirm: (_checkboxChecked: boolean, passphrase = "") => {
						void (async () => {
							try {
								const result = await exportPortableProjectSessionArchive({
									cwd,
									passphrase,
									defaultFileName: projectName?.trim() || undefined,
								});
								if (result.reason === "no-sessions") {
									showToast({ variant: "info", message: t("projectExport.noSessions") });
									return;
								}
								if (result.saved) {
									showToast({
										variant: "success",
										message: t("projectExport.done", { count: result.sessionCount ?? 0 }),
									});
								}
							} catch (error) {
								showToast({
									variant: "error",
									message: t("projectExport.failed", {
										message: error instanceof Error ? error.message : String(error),
									}),
								});
							}
						})();
					},
				});
			},
			exportMigrationPackage: (cwd: string, projectName?: string) => {
				setProjectMenu(null);
				// 迁移包导出：口令 + 「含项目文件」复选（默认勾选）；零会话/远程/超限以
				// reason 区分提示，保存框只在真正可导出时弹出。
				setConfirm({
					title: t("contextMenu.exportMigration"),
					message: t("migrationExport.passphrasePrompt"),
					input: { password: true },
					checkbox: { label: t("migrationExport.includeWorkspace"), checked: true },
					onConfirm: (includeWorkspace: boolean, passphrase = "") => {
						void (async () => {
							try {
								const result = await exportProjectMigrationPackage({
									cwd,
									passphrase,
									includeWorkspace,
									defaultFileName: projectName?.trim() || undefined,
								});
								if (result.reason === "no-sessions") {
									showToast({ variant: "info", message: t("migrationExport.noSessions") });
									return;
								}
								if (result.reason === "remote-unsupported") {
									showToast({ variant: "warning", message: t("migrationExport.remoteUnsupported") });
									return;
								}
								if (result.reason === "workspace-too-large") {
									showToast({
										variant: "warning",
										message: t("migrationExport.tooLarge", { path: result.detail ?? "" }),
									});
									return;
								}
								if (result.saved) {
									showToast({
										variant: "success",
										message: t("migrationExport.done", {
											sessionCount: result.sessionCount ?? 0,
											fileCount: result.workspaceFileCount ?? 0,
										}),
									});
								}
							} catch (error) {
								showToast({
									variant: "error",
									message: t("migrationExport.failed", {
										message: error instanceof Error ? error.message : String(error),
									}),
								});
							}
						})();
					},
				});
			},
			removeProject: (cwd: string) => {
				setProjectMenu(null);
				model.actions.removeProject(cwd);
			},
			deleteProject: (cwd: string) => {
				setProjectMenu(null);
				model.actions.deleteProject(cwd);
			},
			clearConversation: (cwd: string) => {
				setProjectMenu(null);
				model.actions.clearConversation(cwd);
			},
			clearClaw: (cwd: string) => {
				setProjectMenu(null);
				model.actions.clearClaw(cwd);
			},
			openClawSettings: () => {
				setProjectMenu(null);
				model.actions.openClawSettings();
			},
		},
	};
}

function isAgentTeamSession(
	session: SessionContextMenuSession,
): session is Extract<SessionContextMenuSession, { readonly kind: "agent-team" }> {
	return "kind" in session && session.kind === "agent-team";
}
