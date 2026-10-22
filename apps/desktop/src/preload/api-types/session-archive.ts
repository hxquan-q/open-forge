export interface SessionArchiveExportResult {
	readonly saved: boolean;
	readonly path?: string;
}

export interface ProjectSessionArchiveExportResult {
	readonly saved: boolean;
	readonly path?: string;
	readonly sessionCount?: number;
	readonly reason?: "no-sessions";
}

export interface SessionArchiveImportDecision {
	readonly fingerprint: string;
	readonly sessionId: string;
	readonly conflict: {
		readonly action: "skip-idempotent" | "create-copy" | "overwrite";
		readonly reason: string;
		readonly mtimeHint?: string;
	};
	readonly writtenPath?: string;
}

export interface SessionArchiveImportResult {
	readonly canceled: boolean;
	readonly decisions: readonly SessionArchiveImportDecision[];
}

// ── 项目迁移包（OFAR v2，ADR-0147）──

export interface ProjectMigrationExportResult {
	readonly saved: boolean;
	readonly path?: string;
	readonly sessionCount?: number;
	readonly workspaceFileCount?: number;
	readonly reason?: "no-sessions" | "remote-unsupported" | "workspace-too-large";
	/** 体积超限时的定位信息（触发上限的相对路径等）。 */
	readonly detail?: string;
}

export interface ProjectMigrationPreviewInfo {
	readonly archivePath: string;
	readonly sourceCwd?: string;
	readonly sessionCount: number;
	readonly sessions: readonly { sessionId: string; name?: string }[];
	readonly workspaceFileCount: number;
	readonly workspaceBytes: number;
	readonly formatVersion: number;
}

export type ProjectMigrationPreviewResult =
	| { readonly canceled: true }
	| { readonly canceled: false; readonly classic: true; readonly archivePath: string }
	| ({ readonly canceled: false; readonly classic: false } & ProjectMigrationPreviewInfo);

export interface ProjectMigrationWorkspaceReport {
	readonly written: number;
	readonly skipped: number;
	readonly overwritten: number;
	/** 无法恢复的相对路径（路径逃逸拒绝、symlink/目录类型不一致、写失败）。 */
	readonly failed: readonly string[];
}

export interface ProjectMigrationApplyReport {
	readonly sessions: readonly SessionArchiveImportDecision[];
	readonly workspace: ProjectMigrationWorkspaceReport;
}

export interface DesktopSessionArchiveApi {
	export(input: {
		sessionPath: string;
		passphrase?: string;
		defaultFileName?: string;
	}): Promise<SessionArchiveExportResult>;
	exportProject(input: {
		cwd: string;
		passphrase?: string;
		defaultFileName?: string;
	}): Promise<ProjectSessionArchiveExportResult>;
	import(input?: { passphrase?: string }): Promise<SessionArchiveImportResult>;
	/** 导出项目迁移包（会话+产物，OFAR v2）。 */
	exportMigration(input: {
		cwd: string;
		passphrase?: string;
		/** 含项目产物文件（默认 true，排除 .git/node_modules/.vetta）。 */
		includeWorkspace?: boolean;
		defaultFileName?: string;
	}): Promise<ProjectMigrationExportResult>;
	/** 框选并预览归档：v1 会话归档返回 classic 由调用方回落现行导入；不落盘。 */
	previewMigration(input?: { passphrase?: string; archivePath?: string }): Promise<ProjectMigrationPreviewResult>;
	/** 应用迁移包到目标位置（cwd 重写 + 产物恢复）。 */
	applyMigration(input: {
		archivePath: string;
		passphrase?: string;
		targetCwd: string;
		overwriteWorkspace?: boolean;
	}): Promise<ProjectMigrationApplyReport>;
}
