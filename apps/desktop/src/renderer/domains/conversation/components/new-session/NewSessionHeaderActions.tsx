// Modified by The Open Forge contributors.
import { useMemo } from "react";
import { ConversationHeaderActions } from "@domains/header-actions/ConversationHeaderActions";
import { ChatHeaderActions, type HeaderActionBarItem } from "@vetta-org/theme-ui/chat";

interface NewSessionHeaderActionsProps {
	activityOpen: boolean;
	cwd: string;
	onToggleActivity: () => void;
	onTogglePin: () => void;
	panelTitle: string;
	pinTitle: string;
	pinned: boolean;
}

/**
 * 新会话页的标题栏右侧动作：保留窗口置顶与活动面板开关。
 * 此时还没有消息，因此不渲染导出按钮。
 */
export function NewSessionHeaderActions({
	activityOpen,
	cwd,
	onToggleActivity,
	onTogglePin,
	panelTitle,
	pinTitle,
	pinned,
}: NewSessionHeaderActionsProps): JSX.Element {
	const builtins = useMemo<HeaderActionBarItem[]>(
		() => [{
			key: "builtin:pin",
			title: pinTitle,
			icon: <span className={pinned ? "icon-[solar--pin-bold]" : "icon-[solar--pin-linear]"} />,
			active: pinned,
			promoteWhenActive: true,
			retainWhenNarrow: true,
			behavior: { type: "click", onClick: onTogglePin },
		}],
		[onTogglePin, pinTitle, pinned],
	);
	return (
		<ConversationHeaderActions
			builtins={builtins}
			cwd={cwd}
			surface="new-session"
			pinned={<ChatHeaderActions.Panel title={panelTitle} open={activityOpen} onClick={onToggleActivity} />}
		/>
	);
}
