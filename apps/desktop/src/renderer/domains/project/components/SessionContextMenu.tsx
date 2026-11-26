// Modified by The Open Forge contributors.
import type { SessionContextMenuSession } from "@shared/store/atoms";
import { SessionContextMenuView } from "@vetta-org/theme-ui/project";
import { createPortal } from "react-dom";
import { useMoveSpaceMenu } from "../hooks/useMoveSpaceMenu";
import { useSessionContextMenuModel } from "../hooks/useSessionContextMenuModel";

interface SessionContextMenuProps {
	x: number;
	y: number;
	session: SessionContextMenuSession;
	allowMutations: boolean;
	canTag: boolean;
	independent?: boolean;
	onClose: () => void;
	onDelete: (session: SessionContextMenuSession) => void;
}

export function SessionContextMenu({
	x,
	y,
	session,
	allowMutations,
	canTag,
	independent,
	onClose,
	onDelete,
}: SessionContextMenuProps): JSX.Element {
	const model = useSessionContextMenuModel(session, allowMutations, canTag, onClose, onDelete);
	// ADR-0156 无 team 归属维度：团队会话不可移动（归属键统一用会话路径）。
	// 默认区/项目组会话经投影后普通会话也带 kind: "conversation"，
	// 门控必须按 team 判别，不能用是否存在 kind。
	const move = useMoveSpaceMenu(
		independent && (!("kind" in session) || session.kind !== "agent-team")
			? { kind: "conversation", key: session.path }
			: undefined,
		onClose,
	);
	return createPortal(
		<SessionContextMenuView {...model} extraItems={move ? [...(model.extraItems ?? []), move] : model.extraItems} x={x} y={y} />,
		document.body,
	);
}
