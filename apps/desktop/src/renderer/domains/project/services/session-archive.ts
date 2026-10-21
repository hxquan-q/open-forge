// Copyright The Open Forge contributors.

/** Thin project-domain helper around the main-process project session archive API. */

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
