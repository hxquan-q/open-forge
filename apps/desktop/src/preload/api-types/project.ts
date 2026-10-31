// Modified by The Open Forge contributors.
// ─── Project import / export ───
//
// Mirrors `src/main/ipc/project-export.ts`. Both directions can return either
// the success payload OR an `{ error: { code, message } }` envelope so the
// renderer can branch on the failure mode without try/catch.

export type ProjectExportErrorCode =
	| "unsupported-type"
	| "invalid-zip"
	| "unsupported-zip"
	| "incompatible-version"
	| "extract-failed"
	| "user-cancelled";

export interface ProjectExportError {
	error: { code: ProjectExportErrorCode; message: string };
}

export interface ProjectExportSuccess {
	saved: boolean;
	zipPath?: string;
}

export interface ProjectImportSuccess {
	path: string;
	name: string;
	type: "normal" | "batch";
	missingSources?: string[];
}

/**
 * 选中 `.ofar`（会话归档 / 项目迁移包）时的结果：主进程不落盘，由渲染端收集口令、
 * 分流 v1 会话归档并打开迁移向导（BUG-0143）。
 */
export interface ProjectMigrationArchiveImport {
	kind: "migration-archive";
	archivePath: string;
}

export type ProjectImportResult = ProjectImportSuccess | ProjectMigrationArchiveImport;

// ─── Project list (CRUD) ───
//
// Mirrors `src/main/ipc/projects.ts`, which delegates to the one `ProjectService`
// that also backs the plugin and Action capabilities. The renderer must not write
// the project list through `config.set` — validation and the change broadcast only
// happen inside that service.

export interface ProjectEntrySnapshot {
	path: string;
	name?: string;
	/** ADR-0151：版块册（allstarProjects）条目的稳定标识；普通册条目缺省。 */
	id?: string;
}

export interface ProjectListSnapshot {
	workspacePath: string;
	projects: readonly ProjectEntrySnapshot[];
	archivedProjects: readonly ProjectEntrySnapshot[];
	/** ADR-0151 第二册：Allstar 自主开发版块的项目册。 */
	allstarProjects: readonly ProjectEntrySnapshot[];
	allstarArchivedProjects: readonly ProjectEntrySnapshot[];
}

export interface DesktopProjectApi {
	/** Export a project to a zip via native save dialog. */
	export(projectDir: string): Promise<ProjectExportSuccess | ProjectExportError>;
	/** Import a project from a zip or a `.ofar` migration archive via native open dialog. `null` = user cancelled. */
	import(): Promise<ProjectImportResult | ProjectExportError | null>;
	/** Read a project's `.vetta/meta.json` (used to detect project type). `null` if absent. */
	readMeta(projectDir: string): Promise<Record<string, unknown> | null>;
	/** Active and archived projects plus the configured workspace root. */
	list(): Promise<ProjectListSnapshot>;
	/** Create the directory and register it. `path` defaults to `<workspace>/<name>`. */
	create(input: { name: string; path?: string }): Promise<ProjectEntrySnapshot>;
	/** Register an existing directory, un-archiving it when it was archived before. */
	open(input: { path: string; name?: string }): Promise<ProjectEntrySnapshot>;
	/** Change a project's display name; the directory on disk is untouched. */
	rename(input: { path: string; name: string }): Promise<ProjectEntrySnapshot>;
	archive(path: string): Promise<void>;
	unarchive(path: string): Promise<void>;
	/** Forget the project. The directory on disk is left alone. */
	remove(path: string): Promise<void>;
	/**
	 * ADR-0151 第二册：把已存在目录登记进版块册（生成稳定条目 id）。
	 * 同路径可同时存在于普通册，两者是不同项目实体。已在册则幂等。
	 */
	openAllstar(input: { path: string; name?: string }): Promise<ProjectEntrySnapshot>;
	/** 移出版块册条目（"移出版块"）；不动普通册条目，不动磁盘目录。 */
	removeAllstar(path: string): Promise<void>;
}
