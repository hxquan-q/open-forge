// Modified by The Open Forge contributors.
import type { SessionContextMenuSession } from "@shared/store/atoms";
import {
	conversationTagEditorAtom,
	conversationTagsAtom,
	pinnedSessionPathsAtom,
	renamingSessionPathAtom,
	runningSessionPathsAtom,
	sessionDisplayLabel,
	setSessionPinnedAtom,
} from "@shared/store/atoms";
import { showToast } from "@shared/store/toast-atoms";
import { useNavigate } from "@tanstack/react-router";
import { isSshProjectUri } from "@vetta/ssh-transport/project-uri";
import type { SessionContextMenuViewProps } from "@vetta-org/theme-ui/project";
import type { ContextMenuNode } from "@vetta-org/theme-ui/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { conversationTagIds } from "../../../../shared/conversation-tags";

const isMac = navigator.platform.toUpperCase().includes("MAC");

export function useSessionContextMenuModel(
	session: SessionContextMenuSession,
	allowMutations: boolean,
	canTag: boolean,
	onClose: () => void,
	onDelete: (session: SessionContextMenuSession) => void,
): Omit<SessionContextMenuViewProps, "x" | "y"> {
	const { t } = useTranslation("project");
	const navigate = useNavigate();
	const setRenamingSessionPath = useSetAtom(renamingSessionPathAtom);
	const pinnedSessionPaths = useAtomValue(pinnedSessionPathsAtom);
	const setSessionPinned = useSetAtom(setSessionPinnedAtom);
	const runningSessionPaths = useAtomValue(runningSessionPathsAtom);
	const tags = useAtomValue(conversationTagsAtom);
	const openTagEditor = useSetAtom(conversationTagEditorAtom);
	const pinned = pinnedSessionPaths.has(session.path);
	// 归档只隐藏侧栏行、随时可恢复，团队会话与普通会话同等对待；运行中的会话另需先停止。
	const canArchive = allowMutations;
	const archiveDisabled = runningSessionPaths.has(session.path);

	const handleRename = useCallback(() => {
		setRenamingSessionPath(session.path);
		onClose();
	}, [onClose, session.path, setRenamingSessionPath]);

	const handleOpenInFolder = useCallback(() => {
		void window.vetta.shell.showInFolder(session.cwd);
		onClose();
	}, [onClose, session.cwd]);

	const handleDelete = useCallback(() => {
		onDelete(session);
	}, [onDelete, session]);
	const handleTogglePin = useCallback(() => {
		setSessionPinned({ path: session.path, pinned: !pinned });
		onClose();
	}, [onClose, pinned, session.path, setSessionPinned]);

	const handleArchive = useCallback(() => {
		// 归档可逆且不留数据痕迹，因此不弹确认框；落点信息（名字、路径、团队身份）随快照一起存，
		// 设置页据此列出条目、删除团队会话时走团队级删除，都不必回读会话文件。
		const team = isAgentTeamSession(session) ? session : null;
		// 名字与侧栏行一致：团队会话用团队标题（未命名时用团队占位名），不落成「未命名会话」。
		const label = team ? team.sessionTitle || t("sidebar.session.untitledTeam") : sessionDisplayLabel(session);
		void window.vetta.archivedSessions.archive({
			path: session.path,
			cwd: session.cwd,
			label,
			...(team ? { teamId: team.teamId, teamSessionId: team.teamSessionId } : {}),
		});
		onClose();
		showToast({
			variant: "success",
			message: t("contextMenu.archiveToast", { name: label }),
			action: {
				label: t("contextMenu.archiveToastAction"),
				onClick: () => void navigate({ to: "/settings/$tab", params: { tab: "archive" } }),
			},
		});
	}, [navigate, onClose, session, t]);

	const extraItems = useMemo<readonly ContextMenuNode[] | undefined>(() => {
		if (!canTag) return undefined;
		const assigned = new Set(conversationTagIds(tags, session.path));
		const items: ContextMenuNode[] = [
			{
				kind: "item",
				id: "tag-new",
				label: t("contextMenu.tags.new"),
				iconClassName: "icon-[solar--add-circle-linear]",
				onSelect: () => {
					openTagEditor({ mode: "create", sessionPath: session.path });
					onClose();
				},
			},
		];
		// 一个标签都没有时不画分割线与「管理标签…」——没东西可管。
		if (tags.tags.length > 0) {
			items.push({ kind: "separator", id: "tag-sep" });
			for (const tag of tags.tags) {
				const checked = assigned.has(tag.id);
				items.push({
					kind: "item",
					id: `tag-${tag.id}`,
					label: tag.name,
					dotColor: tag.color,
					checked,
					onSelect: () => {
						void window.vetta.conversationTags.assign({
							sessionPath: session.path,
							tagId: tag.id,
							assigned: !checked,
						});
						onClose();
					},
				});
			}
			items.push({ kind: "separator", id: "tag-manage-sep" });
			items.push({
				kind: "item",
				id: "tag-manage",
				label: t("contextMenu.tags.manage"),
				iconClassName: "icon-[solar--settings-linear]",
				onSelect: () => {
					openTagEditor({ mode: "manage" });
					onClose();
				},
			});
		}
		return [
			{
				kind: "submenu",
				id: "tags",
				label: t("contextMenu.tags.label"),
				iconClassName: "icon-[solar--tag-linear]",
				items,
			},
		];
	}, [canTag, onClose, openTagEditor, session.path, t, tags]);

	return {
		archiveDisabled,
		canArchive,
		canDelete: allowMutations && session.access?.delete !== false,
		// 远程项目下的会话，工作目录在远端，系统文件管理器无从显示。
		canOpenInFolder: !isSshProjectUri(session.cwd),
		canRename: allowMutations && session.access?.rename !== false,
		extraItems,
		labels: {
			pin: pinned ? t("contextMenu.unpin") : t("contextMenu.pin"),
			rename: t("contextMenu.rename"),
			openInFolder: isMac ? t("contextMenu.openInFinder") : t("contextMenu.openInExplorer"),
			delete: t("contextMenu.delete"),
			archive: t("contextMenu.archive"),
			archiveDisabled: t("contextMenu.archiveDisabled"),
		},
		onArchive: handleArchive,
		onClose,
		onDelete: handleDelete,
		onOpenInFolder: handleOpenInFolder,
		onRename: handleRename,
		onTogglePin: handleTogglePin,
	};
}

function isAgentTeamSession(
	session: SessionContextMenuSession,
): session is Extract<SessionContextMenuSession, { readonly kind: "agent-team" }> {
	return "kind" in session && session.kind === "agent-team";
}
