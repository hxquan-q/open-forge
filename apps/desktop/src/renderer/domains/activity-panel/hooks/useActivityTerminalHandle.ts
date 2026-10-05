// Copyright The Open Forge contributors.

import type { TerminalSurfaceHandle } from "@domains/bottom-panel/terminal/terminal-surface-handle";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo } from "react";
import { useActivityTabActivation } from "../registry/activation-context";
import { useActivityWorkspace } from "../registry/context";
import type { ActivityTabMeta } from "../registry/types";

export const ACTIVITY_TERMINAL_TAB_ID_PREFIX = "activity-terminal:";

const activityTerminalMetaByWorkspaceAtom = atom<Readonly<Record<string, ActivityTabMeta>>>({});

export function activityTerminalTabId(workspaceId: string): string {
	return `${ACTIVITY_TERMINAL_TAB_ID_PREFIX}${workspaceId}`;
}

export function useActivityTerminalMeta(): ActivityTabMeta | undefined {
	const workspace = useActivityWorkspace();
	const metaByWorkspace = useAtomValue(activityTerminalMetaByWorkspaceAtom);
	return metaByWorkspace[workspace.id];
}

/**
 * 活动面板上的 TerminalSurface adapter。
 *
 * `tabId` 按 workspace 固定，保证每工作区单实例且与底部面板 `tab-<uuid>` 不撞快照键。
 * close guard 不映射：右栏减号是隐藏，PTY 随 surface 卸载关闭，不必再确认。
 */
export function useActivityTerminalHandle(): TerminalSurfaceHandle {
	const workspace = useActivityWorkspace();
	const active = useActivityTabActivation();
	const setMetaByWorkspace = useSetAtom(activityTerminalMetaByWorkspaceAtom);
	const workspaceId = workspace.id;
	const cwd = workspace.cwd;

	useEffect(() => {
		return () => {
			setMetaByWorkspace((previous) => {
				if (!(workspaceId in previous)) return previous;
				const next = { ...previous };
				delete next[workspaceId];
				return next;
			});
		};
	}, [setMetaByWorkspace, workspaceId]);

	return useMemo<TerminalSurfaceHandle>(
		() => ({
			tabId: activityTerminalTabId(workspaceId),
			cwd,
			active,
			// 右栏活动面板的终端不是插件开的，没有初始载荷可读，也不需要写回。
			payload: undefined,
			setPayload: () => undefined,
			setMeta: (meta) => {
				setMetaByWorkspace((previous) => {
					if (meta === null) {
						if (!(workspaceId in previous)) return previous;
						const next = { ...previous };
						delete next[workspaceId];
						return next;
					}
					const current = previous[workspaceId];
					const label = meta.label ?? current?.label ?? "";
					if (!label) return previous;
					const icon = meta.icon ?? current?.icon;
					if (current?.label === label && current.icon === icon) return previous;
					return { ...previous, [workspaceId]: { label, icon } };
				});
			},
			setCloseGuard: () => {
				// 右栏关闭=隐藏；活进程随 unmount 结束，不走底部面板的确认框。
			},
		}),
		[active, cwd, setMetaByWorkspace, workspaceId],
	);
}
