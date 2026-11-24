// Modified by The Open Forge contributors.
export type DesktopSidebarPlacement =
	| { readonly kind: "default" }
	| { readonly kind: "project"; readonly projectPath: string };

/** Product-level Team conversation projection consumed by the sidebar. */
export interface DesktopTeamSidebarConversation {
	readonly kind: "agent-team";
	readonly teamId: string;
	readonly teamSessionId: string;
	readonly coordinationSessionPath: string;
	/** Workspace shown by sidebar actions such as "Open in folder". */
	readonly cwd: string;
	readonly memberAvatarUrls: readonly string[];
	readonly sessionTitle: string;
	readonly createdAt: number;
	readonly updatedAt: number;
	readonly placement: DesktopSidebarPlacement;
	/** 协调会话数据文件已丢失（BUG-0195）：置灰展示、菜单只留删除；缺省视为可用。 */
	readonly dataFileMissing?: boolean;
}
