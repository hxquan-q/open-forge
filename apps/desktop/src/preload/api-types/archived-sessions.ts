// Copyright The Open Forge contributors.
import type { ArchivedSessionsSnapshot } from "../../shared/archived-sessions.js";

export interface DesktopArchivedSessionsApi {
	list: () => Promise<ArchivedSessionsSnapshot>;
	/**
	 * label 是调用方算好的显示名；主进程不做 i18n 回退。
	 * 团队会话一并带上 teamId/teamSessionId：设置页删除时据此走团队级删除。
	 */
	archive: (input: {
		path: string;
		label: string;
		cwd: string;
		teamId?: string;
		teamSessionId?: string;
	}) => Promise<ArchivedSessionsSnapshot>;
	unarchive: (sessionPath: string) => Promise<ArchivedSessionsSnapshot>;
	forget: (sessionPaths: readonly string[]) => Promise<ArchivedSessionsSnapshot>;
	onChanged: (listener: (snapshot: ArchivedSessionsSnapshot) => void) => () => void;
}
