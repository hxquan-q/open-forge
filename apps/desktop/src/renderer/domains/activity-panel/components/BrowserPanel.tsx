// Modified by The Open Forge contributors.
import { BrowserPanelView } from "@vetta-org/theme-ui/activity";
import { useBrowserPanelModel } from "../hooks/useBrowserPanelModel";

/**
 * 工作空间级内置浏览器：主进程 WebContentsView + 本地占位矩形的预览窗（TASK-0072）。
 * - 按 workspaceId 隔离：view 按 workspace 在主进程保活，切工作空间换绑对应 view。
 * - 跨活动 tab 保活由 ActivityPanel 负责（常驻挂载 + CSS 隐藏，不条件卸载）；
 *   隐藏时经 activation context 通知主进程 setVisible(false)。
 */
export function BrowserPanel(): JSX.Element {
	const model = useBrowserPanelModel();
	return <BrowserPanelView {...model} />;
}
