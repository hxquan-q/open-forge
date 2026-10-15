// Copyright The Open Forge contributors.

import { bottomPanelStateAtom, dispatchBottomPanelAtom } from "@shared/store/bottom-panel-atoms";
import { findBottomPanelTab } from "@shared/store/bottom-panel-layout";
import { atom } from "jotai";
import { TERMINAL_PANEL_ID } from "../builtins/terminal-panel";
import type { TerminalLaunchPayload } from "../terminal/terminal-launch";
import { bottomPanelFocusRequestAtom } from "./instance-atoms";

export interface LaunchTerminalCommand {
	readonly tabId: string;
	readonly newLeafId: string;
	/** 发起方的 tab：新终端落在它所在的格子里，用户点完就能在原处看到结果。 */
	readonly nearTabId: string;
	readonly payload: TerminalLaunchPayload;
}

/**
 * 实例发起的 tab 操作。本仓底部面板按 `bottomPanelScopeKeyAtom` 内部定scope，
 * 实例只在当前活跃会话中渲染，这里直接用单例 atom 作用于当前 scope。
 */
export const launchTerminalAtom = atom(null, (_get, set, command: LaunchTerminalCommand) => {
	const near = findBottomPanelTab(_get(bottomPanelStateAtom).root, command.nearTabId);
	set(dispatchBottomPanelAtom, {
		type: "open-tab",
		tabId: command.tabId,
		componentId: TERMINAL_PANEL_ID,
		newLeafId: command.newLeafId,
		leafId: near?.leaf.id,
		payload: command.payload,
	});
	set(bottomPanelFocusRequestAtom, command.tabId);
});

/** 展开并激活目标 tab；不存在（已被关闭）时返回 false。 */
export const revealTabAtom = atom(null, (get, set, tabId: string): boolean => {
	if (!findBottomPanelTab(get(bottomPanelStateAtom).root, tabId)) return false;
	set(dispatchBottomPanelAtom, { type: "set-collapsed", collapsed: false });
	set(dispatchBottomPanelAtom, { type: "activate-tab", tabId });
	set(bottomPanelFocusRequestAtom, tabId);
	return true;
});
