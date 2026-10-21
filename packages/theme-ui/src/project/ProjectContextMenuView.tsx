// Modified by The Open Forge contributors.
import type { JSX } from "react";
import { ContextMenuView, type ContextMenuNode } from "../shared/ContextMenuView";

export type ProjectContextMenuScope = "conversation" | "claw";

export interface ProjectContextMenuViewLabels {
	openInFolder: string;
	exportSessions: string;
	archiveProject: string;
	removeFromList: string;
	deleteProject: string;
	clearConversation: string;
	clearConversationDisabled: string;
	clearClaw: string;
	clearClawDisabled: string;
	clawSettings: string;
}

export interface ProjectContextMenuViewProps {
	/**
	 * False when the project has no counterpart on this computer (a remote project):
	 * there is nothing for the system file manager to show. Defaults to true.
	 */
	canOpenInFolder?: boolean;
	clearClawDisabled?: boolean;
	clearConversationDisabled?: boolean;
	defaultScope?: ProjectContextMenuScope;
	isDefault: boolean;
	labels: ProjectContextMenuViewLabels;
	onArchive: () => void;
	onClearClaw?: () => void;
	onClearConversation?: () => void;
	onClose: () => void;
	onDelete: () => void;
	/** Export every session of this project into one portable archive. */
	onExportSessions?: () => void;
	onOpenClawSettings?: () => void;
	onOpenInFolder: () => void;
	onRemove: () => void;
	x: number;
	y: number;
}

export function ProjectContextMenuView({
	canOpenInFolder = true,
	clearClawDisabled,
	clearConversationDisabled,
	defaultScope,
	isDefault,
	labels,
	onArchive,
	onClearClaw,
	onClearConversation,
	onClose,
	onDelete,
	onExportSessions,
	onOpenClawSettings,
	onOpenInFolder,
	onRemove,
	x,
	y,
}: ProjectContextMenuViewProps): JSX.Element {
	const items: ContextMenuNode[] = [];

	// 远程项目在这台电脑上没有对应的位置，系统文件管理器无从显示；
	// 但会话记录落在本机分片目录，导出/迁移仍然可用。
	if (!isDefault && canOpenInFolder) {
		items.push({
			kind: "item",
			id: "open-in-folder",
			label: labels.openInFolder,
			iconClassName: "icon-[solar--folder-open-linear]",
			onSelect: onOpenInFolder,
		});
	}

	if (isDefault && defaultScope === "conversation" && onClearConversation) {
		items.push({
			kind: "item",
			id: "clear-conversation",
			label: clearConversationDisabled ? labels.clearConversationDisabled : labels.clearConversation,
			iconClassName: "icon-[solar--broom-linear]",
			danger: true,
			disabled: clearConversationDisabled,
			onSelect: onClearConversation,
		});
	}

	if (isDefault && defaultScope === "claw") {
		if (onClearClaw) {
			items.push({
				kind: "item",
				id: "clear-claw",
				label: clearClawDisabled ? labels.clearClawDisabled : labels.clearClaw,
				iconClassName: "icon-[solar--broom-linear]",
				danger: true,
				disabled: clearClawDisabled,
				onSelect: onClearClaw,
			});
		}
		if (onOpenClawSettings) {
			items.push({
				kind: "item",
				id: "claw-settings",
				label: labels.clawSettings,
				iconClassName: "icon-[solar--settings-linear]",
				onSelect: onOpenClawSettings,
			});
		}
	}

	if (!isDefault) {
		if (onExportSessions) {
			items.push({
				kind: "item",
				id: "export-sessions",
				label: labels.exportSessions,
				iconClassName: "icon-[solar--export-linear]",
				onSelect: onExportSessions,
			});
		}
		items.push({
			kind: "item",
			id: "archive-project",
			label: labels.archiveProject,
			iconClassName: "icon-[solar--archive-minimalistic-linear]",
			onSelect: onArchive,
		});
		items.push({
			kind: "item",
			id: "remove-from-list",
			label: labels.removeFromList,
			iconClassName: "icon-[solar--list-cross-minimalistic-linear]",
			onSelect: onRemove,
		});
		items.push({ kind: "separator", id: "project-danger" });
		items.push({
			kind: "item",
			id: "delete-project",
			label: labels.deleteProject,
			iconClassName: "icon-[solar--trash-bin-trash-linear]",
			danger: true,
			onSelect: onDelete,
		});
	}

	return <ContextMenuView items={items} onClose={onClose} x={x} y={y} className="w-[170px]" />;
}
