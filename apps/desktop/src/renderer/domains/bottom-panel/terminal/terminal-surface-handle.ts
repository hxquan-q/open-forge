// Copyright The Open Forge contributors.

import type { BottomPanelHandle } from "../registry/types";

/**
 * TerminalSurface 对宿主的全部依赖。底部面板与活动面板各自提供 adapter，
 * 这样 surface 不再绑死 `useBottomPanelInstance`。
 */
export type TerminalSurfaceHandle = Pick<
	BottomPanelHandle,
	"tabId" | "cwd" | "active" | "payload" | "setMeta" | "setPayload" | "setCloseGuard"
>;
