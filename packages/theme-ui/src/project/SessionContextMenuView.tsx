// Modified by The Open Forge contributors.
import type { JSX } from "react";
import { ContextMenuView, type ContextMenuNode } from "../shared/ContextMenuView";

export interface SessionContextMenuViewLabels {
	pin: string;
	rename: string;
	openInFolder: string;
	delete: string;
	/** 「归档会话」的动作名。 */
	archive: string;
	/** 归档被拒绝时取而代之的说明，例如「请先停止运行中的会话」。 */
	archiveDisabled: string;
}

export interface SessionContextMenuViewProps {
	canArchive: boolean;
	/** 运行中的会话归档会藏掉唯一的进度指示，置灰并把原因写在行上。 */
	archiveDisabled?: boolean;
	canDelete: boolean;
	/**
	 * False when the session's project has no counterpart on this computer (a remote
	 * project): there is nothing for the system file manager to show. Defaults to true.
	 */
	canOpenInFolder?: boolean;
	canRename: boolean;
	labels: SessionContextMenuViewLabels;
	/** 挂在「重命名」之后的附加节点，例如标签二级菜单。 */
	extraItems?: readonly ContextMenuNode[];
	onArchive: () => void;
	onClose: () => void;
	onDelete: () => void;
	onOpenInFolder: () => void;
	onRename: () => void;
	onTogglePin: () => void;
	x: number;
	y: number;
}

export function SessionContextMenuView({
	canArchive,
	archiveDisabled = false,
	canDelete,
	canOpenInFolder = true,
	canRename,
	labels,
	extraItems,
	onArchive,
	onClose,
	onDelete,
	onOpenInFolder,
	onRename,
	onTogglePin,
	x,
	y,
}: SessionContextMenuViewProps): JSX.Element {
	const items: ContextMenuNode[] = [
		{ kind: "item", id: "pin", label: labels.pin, iconClassName: "icon-[solar--pin-linear]", onSelect: onTogglePin },
	];
	// 归档与置顶同属「列表整理」，紧挨着放，别混进重命名/删除那组。
	if (canArchive) {
		items.push({
			kind: "item",
			id: "archive",
			label: archiveDisabled ? labels.archiveDisabled : labels.archive,
			iconClassName: "icon-[mdi--archive-outline]",
			disabled: archiveDisabled,
			onSelect: onArchive,
		});
	}
	if (canRename) {
		items.push({
			kind: "item",
			id: "rename",
			label: labels.rename,
			iconClassName: "icon-[solar--pen-2-linear]",
			onSelect: onRename,
		});
	}
	if (extraItems && extraItems.length > 0) items.push(...extraItems);
	if (canOpenInFolder) {
		items.push({
			kind: "item",
			id: "open-in-folder",
			label: labels.openInFolder,
			iconClassName: "icon-[solar--folder-open-linear]",
			onSelect: onOpenInFolder,
		});
	}
	if (canDelete) {
		items.push({
			kind: "item",
			id: "delete",
			label: labels.delete,
			iconClassName: "icon-[solar--trash-bin-trash-linear]",
			danger: true,
			onSelect: onDelete,
		});
	}

	return <ContextMenuView items={items} onClose={onClose} x={x} y={y} />;
}
