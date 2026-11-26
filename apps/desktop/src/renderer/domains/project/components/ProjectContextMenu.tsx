// Modified by The Open Forge contributors.
import type { Project } from "@shared/store/atoms";
import { ProjectContextMenuView } from "@vetta-org/theme-ui/project";
import type { ContextMenuNode } from "@vetta-org/theme-ui/shared";
import { createPortal } from "react-dom";
import { useMoveSpaceMenu } from "../hooks/useMoveSpaceMenu";
import { useProjectContextMenuModel } from "../hooks/useProjectContextMenuModel";

interface ProjectContextMenuProps {
	x: number;
	y: number;
	project: Project;
	onClose: () => void;
	onArchive: (cwd: string) => void;
	onRemove: (cwd: string) => void;
	onDelete: (cwd: string) => void;
	defaultScope?: "conversation" | "claw";
	onClearConversation?: (cwd: string) => void;
	onClearClaw?: (cwd: string) => void;
	onOpenClawSettings?: () => void;
	onExportSessions?: (cwd: string, projectName?: string) => void;
	onExportMigration?: (cwd: string, projectName?: string) => void;
	clearConversationDisabled?: boolean;
	clearClawDisabled?: boolean;
	/** 由所在面板追加的菜单项，排在「移动工作空间」之前。 */
	extraItems?: readonly ContextMenuNode[];
}

export function ProjectContextMenu({
	x,
	y,
	project,
	onClose,
	onArchive,
	onRemove,
	onDelete,
	defaultScope,
	onClearConversation,
	onClearClaw,
	onOpenClawSettings,
	onExportSessions,
	onExportMigration,
	clearConversationDisabled,
	clearClawDisabled,
	extraItems = [],
}: ProjectContextMenuProps): JSX.Element {
	const model = useProjectContextMenuModel({
		project,
		onClose,
		onArchive,
		onRemove,
		onDelete,
		defaultScope,
		onClearConversation,
		onClearClaw,
		onOpenClawSettings,
		onExportSessions,
		onExportMigration,
		clearConversationDisabled,
		clearClawDisabled,
	});
	// 默认「对话」区与批量项目组不归属任何空间，不提供移动入口。
	const move = useMoveSpaceMenu(
		!project.isDefault && project.type !== "batch" ? { kind: "project", key: project.cwd } : undefined,
		onClose,
	);
	const items = move ? [...extraItems, move] : extraItems;
	return createPortal(<ProjectContextMenuView {...model} extraItems={items} x={x} y={y} />, document.body);
}
