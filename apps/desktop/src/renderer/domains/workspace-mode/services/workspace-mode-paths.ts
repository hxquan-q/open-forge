/**
 * Mode Switcher 只在「工作区」路由出现：会话页、新会话页、项目详情页。
 * settings / automation / knowledge / agent-teams 等独立面有自己的页头语义，
 * 且 Team 会话固定属于 coding 生态，不在这里切换。
 */
export function isWorkspaceModePath(pathname: string): boolean {
	return (
		pathname === "/" ||
		pathname === "/new-session" ||
		pathname.startsWith("/new-session/") ||
		pathname.startsWith("/project/")
	);
}
