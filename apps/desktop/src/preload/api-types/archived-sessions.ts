// Copyright The Open Forge contributors.
import type { ArchivedSessionsSnapshot } from "../../shared/archived-sessions.js";

export interface DesktopArchivedSessionsApi {
	list: () => Promise<ArchivedSessionsSnapshot>;
	/** label 是调用方算好的显示名；主进程不做 i18n 回退。 */
	archive: (input: { path: string; label: string; cwd: string }) => Promise<ArchivedSessionsSnapshot>;
	unarchive: (sessionPath: string) => Promise<ArchivedSessionsSnapshot>;
	forget: (sessionPaths: readonly string[]) => Promise<ArchivedSessionsSnapshot>;
	onChanged: (listener: (snapshot: ArchivedSessionsSnapshot) => void) => () => void;
}
