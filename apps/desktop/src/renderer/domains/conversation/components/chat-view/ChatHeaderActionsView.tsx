import { Button } from "@shared/components/ui/button";
import { ChatHeaderActions } from "@vetta-org/theme-ui/chat";
import { BackgroundTasksBadge } from "../BackgroundTasksBadge";
import { SandboxGrantsBadge } from "../SandboxGrantsBadge";
import type { ChatViewActions, ChatViewHeaderModel } from "./types";

interface ChatHeaderActionsViewProps {
	actions: ChatViewActions;
	model: ChatViewHeaderModel;
}

export function ChatHeaderActionsView({ actions, model }: ChatHeaderActionsViewProps): JSX.Element {
	return (
		<>
			<BackgroundTasksBadge />
			<SandboxGrantsBadge />
			<ChatHeaderActions.Export
				title={model.exportTitle}
				disabled={model.exportDisabled}
				exporting={model.exporting}
				onClick={actions.openExport}
			/>
			<Button
				size="icon-xs"
				variant="ghost"
				title={model.archiveExportTitle}
				disabled={model.archiveExportDisabled}
				onClick={actions.exportArchive}
			>
				<span
					className={
						model.archiveExporting
							? "icon-[mdi--loading] animate-spin text-[14px]"
							: "icon-[solar--archive-minimalistic-linear] text-[14px]"
					}
				/>
			</Button>
			<Button size="icon-xs" variant="ghost" title={model.archiveImportTitle} onClick={actions.importArchive}>
				<span className="icon-[solar--archive-up-linear] text-[14px]" />
			</Button>
			<ChatHeaderActions.Pin
				title={model.pinTitle}
				pinned={model.pinned}
				onClick={actions.togglePin}
			/>
			<ChatHeaderActions.Terminal
				title={model.terminalTitle}
				focused={model.terminalFocused}
				disabled={!model.terminalAvailable}
				onClick={actions.openTerminal}
			/>
			<ChatHeaderActions.BottomPanel
				title={model.bottomPanelTitle}
				open={model.bottomPanelOpen}
				onClick={actions.toggleBottomPanel}
			/>
			<ChatHeaderActions.Panel
				title={model.panelTitle}
				open={model.panelOpen}
				onClick={actions.togglePanel}
			/>
		</>
	);
}
