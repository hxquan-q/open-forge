// Modified by The Open Forge contributors.
import { useAtomValue } from "jotai";
import { activeSessionCwdAtom } from "@shared/store/chat-atoms";
import { type JSX, useMemo } from "react";
import { ConversationHeaderActions } from "@domains/header-actions/ConversationHeaderActions";
import { ChatHeaderActions, type HeaderActionBarItem } from "@vetta-org/theme-ui/chat";
import { BackgroundTasksBadge } from "../BackgroundTasksBadge";
import { SandboxGrantsBadge } from "../SandboxGrantsBadge";
import type { ChatViewActions, ChatViewHeaderModel } from "./types";

interface ChatHeaderActionsViewProps {
	actions: ChatViewActions;
	model: ChatViewHeaderModel;
}

/**
 * 会话页顶栏右侧按钮组：内置动作（导出 / 归档 / 置顶 / 终端 / 底部面板）与插件动作
 * 合进同一个宿主管理的组（上限 7 格、收纳托盘、拖拽排序持久化），渲染与布局在
 * `ConversationHeaderActions` 与 `@vetta-org/theme-ui/chat` 的 `HeaderActionBarView` 里。
 */
export function ChatHeaderActionsView({ actions, model }: ChatHeaderActionsViewProps): JSX.Element {
	const cwd = useAtomValue(activeSessionCwdAtom);
	const builtins = useMemo<HeaderActionBarItem[]>(
		() => [
			{
				key: "builtin:export",
				title: model.exportTitle,
				disabled: model.exportDisabled,
				icon: (
					<span
						className={
							model.exporting
								? "icon-[mdi--loading] animate-spin"
								: "icon-[solar--square-share-line-linear]"
						}
					/>
				),
				behavior: { type: "click", onClick: actions.openExport },
			},
			{
				key: "builtin:archive-export",
				title: model.archiveExportTitle,
				disabled: model.archiveExportDisabled,
				icon: (
					<span
						className={
							model.archiveExporting
								? "icon-[mdi--loading] animate-spin"
								: "icon-[solar--archive-minimalistic-linear]"
						}
					/>
				),
				behavior: { type: "click", onClick: actions.exportArchive },
			},
			{
				key: "builtin:archive-import",
				title: model.archiveImportTitle,
				icon: <span className="icon-[solar--archive-up-linear]" />,
				behavior: { type: "click", onClick: actions.importArchive },
			},
			{
				key: "builtin:pin",
				title: model.pinTitle,
				active: model.pinned,
				// 窗口置顶开着时，即使被收纳也要在面板开关旁露出来，否则用户找不到取消的入口。
				promoteWhenActive: true,
				// 顶栏被挤窄、其余按钮收进「更多」时，置顶仍留在活动面板开关旁边。
				retainWhenNarrow: true,
				icon: <span className={model.pinned ? "icon-[solar--pin-bold]" : "icon-[solar--pin-linear]"} />,
				behavior: { type: "click", onClick: () => void actions.togglePin() },
			},
			{
				key: "builtin:terminal",
				title: model.terminalTitle,
				active: model.terminalFocused,
				disabled: !model.terminalAvailable,
				icon: <span className="icon-[solar--programming-linear]" />,
				behavior: { type: "click", onClick: actions.openTerminal },
			},
			{
				key: "builtin:bottom-panel",
				title: model.bottomPanelTitle,
				active: model.bottomPanelOpen,
				icon: <span className="icon-[solar--window-frame-linear]" />,
				behavior: { type: "click", onClick: actions.toggleBottomPanel },
			},
		],
		[actions, model],
	);
	return (
		<>
			<BackgroundTasksBadge />
			<SandboxGrantsBadge />
			<ConversationHeaderActions
				builtins={builtins}
				cwd={cwd}
				pinned={
					<ChatHeaderActions.Panel
						title={model.panelTitle}
						open={model.panelOpen}
						onClick={actions.togglePanel}
					/>
				}
			/>
		</>
	);
}
