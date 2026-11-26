// Modified by The Open Forge contributors.
import type { SessionContextMenuSession } from "@shared/store/atoms";
import {
	automationCreateRequestAtom,
	batchProjectsAtom,
	conversationBucketCwd,
	conversationTagEditorAtom,
	conversationTagsAtom,
	defaultConversationCwdAtom,
	NO_MESSAGES_SENTINEL,
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
	const requestAutomation = useSetAtom(automationCreateRequestAtom);
	const defaultCwd = useAtomValue(defaultConversationCwdAtom);
	const batchProjects = useAtomValue(batchProjectsAtom);
	const pinned = pinnedSessionPaths.has(session.path);
	// BUG-0195：数据文件缺失的团队会话只保留「删除」——打开/改名/归档/置顶/打标签
	// 对该条目必败或没有意义，删除链路已有降级（BUG-0087），是唯一出口。
	const teamDataFileMissing = isAgentTeamSession(session) && session.dataFileMissing === true;
	// 只有能续写的普通会话才能作为自动化的绑定会话：团队会话由团队编排，不接受外部投递；
	// 批量任务的会话由批量项目编排，新建自动化绑定过去同样没有意义。
	const batchOwned = batchProjects.some((project) => project.tasks.some((task) => task.sessionPath === session.path));
	const canCreateAutomation =
		allowMutations &&
		!teamDataFileMissing &&
		!isAgentTeamSession(session) &&
		!batchOwned &&
		session.access?.resume !== false;
	// 归档只隐藏侧栏行、随时可恢复，团队会话与普通会话同等对待；运行中的会话另需先停止。
	const canArchive = allowMutations && !teamDataFileMissing;
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

	const automationItem = useMemo<ContextMenuNode | undefined>(() => {
		if (!canCreateAutomation) return undefined;
		return {
			kind: "item",
			id: "create-automation",
			label: t("contextMenu.createAutomation"),
			iconClassName: "icon-[solar--clock-circle-linear]",
			onSelect: () => {
				// 绑定「同一个会话」：首次运行就在该会话里续写，与上游 f940900be 语义一致。
				// prompt 预填会话首条消息（该会话最初的指令，适合按周期重跑）；占位或为空则留空。
				const firstMessage = session.firstMessage?.trim() ?? "";
				requestAutomation({
					name: sessionDisplayLabel(session),
					prompt: firstMessage === NO_MESSAGES_SENTINEL ? "" : firstMessage,
					cwd: conversationBucketCwd(session.cwd, defaultCwd),
					runMode: "same-session",
					sessionPath: session.path,
				});
				void navigate({ to: "/automation" });
				onClose();
			},
		};
	}, [canCreateAutomation, defaultCwd, navigate, onClose, requestAutomation, session, t]);

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

	const tagItems = useMemo<readonly ContextMenuNode[] | undefined>(() => {
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

	// 标签子菜单与「创建自动化」并列挂进更多菜单；两者都不可用时整段省略。
	const extraItems = useMemo<readonly ContextMenuNode[] | undefined>(() => {
		const items = [...(tagItems ?? []), ...(automationItem ? [automationItem] : [])];
		return items.length > 0 ? items : undefined;
	}, [automationItem, tagItems]);

	return {
		archiveDisabled,
		canArchive,
		canDelete: allowMutations && session.access?.delete !== false,
		// 远程项目下的会话，工作目录在远端，系统文件管理器无从显示。
		canOpenInFolder: !isSshProjectUri(session.cwd) && !teamDataFileMissing,
		canPin: !teamDataFileMissing,
		canRename: allowMutations && session.access?.rename !== false && !teamDataFileMissing,
		extraItems: teamDataFileMissing ? undefined : extraItems,
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
