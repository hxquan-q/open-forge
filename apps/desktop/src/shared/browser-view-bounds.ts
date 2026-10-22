// Copyright The Open Forge contributors.

import type { DesktopBrowserViewBounds } from "./browser-view-ipc.js";

/**
 * 占位洞还没布局，或页签用 `display: none` 藏起来时，矩形宽高不是正数。
 * 把这种矩形写进 `WebContentsView.setBounds` 会把原生页面压扁；
 * 洞再出现时如果漏掉一次平移回报，页面就留在错误坐标上盖住相邻界面。
 */
export function isReportableBrowserViewBounds(bounds: DesktopBrowserViewBounds): boolean {
	return bounds.width > 0 && bounds.height > 0;
}

export function sameBrowserViewBounds(a: DesktopBrowserViewBounds, b: DesktopBrowserViewBounds): boolean {
	return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
