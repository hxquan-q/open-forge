// Copyright The Open Forge contributors.

/** Thin project-domain helper around the main-process project session archive API. */

import type {
	ProjectMigrationApplyReport,
	ProjectMigrationExportResult,
	ProjectMigrationPreviewResult,
} from "@preload/api-types/session-archive";

export interface ProjectSessionArchiveExportOutcome {
	readonly saved: boolean;
	readonly path?: string;
	readonly sessionCount?: number;
	readonly reason?: "no-sessions";
}

export async function exportPortableProjectSessionArchive(input: {
	readonly cwd: string;
	readonly passphrase: string;
	readonly defaultFileName?: string;
}): Promise<ProjectSessionArchiveExportOutcome> {
	return window.vetta.sessionArchive.exportProject({
		cwd: input.cwd,
		passphrase: input.passphrase,
		defaultFileName: input.defaultFileName,
	});
}

export type ProjectMigrationExportOutcome = ProjectMigrationExportResult;

export async function exportProjectMigrationPackage(input: {
	readonly cwd: string;
	readonly passphrase: string;
	readonly includeWorkspace: boolean;
	readonly defaultFileName?: string;
}): Promise<ProjectMigrationExportOutcome> {
	return window.vetta.sessionArchive.exportMigration({
		cwd: input.cwd,
		passphrase: input.passphrase,
		includeWorkspace: input.includeWorkspace,
		defaultFileName: input.defaultFileName,
	});
}

export async function previewProjectMigrationArchive(passphrase: string): Promise<ProjectMigrationPreviewResult> {
	return window.vetta.sessionArchive.previewMigration({ passphrase });
}

export async function applyProjectMigrationArchive(input: {
	readonly archivePath: string;
	readonly passphrase: string;
	readonly targetCwd: string;
	readonly overwriteWorkspace?: boolean;
}): Promise<ProjectMigrationApplyReport> {
	return window.vetta.sessionArchive.applyMigration({
		archivePath: input.archivePath,
		passphrase: input.passphrase,
		targetCwd: input.targetCwd,
		overwriteWorkspace: input.overwriteWorkspace,
	});
}
