export interface SessionArchiveExportResult {
	readonly saved: boolean;
	readonly path?: string;
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

export interface DesktopSessionArchiveApi {
	export(input: {
		sessionPath: string;
		passphrase?: string;
		defaultFileName?: string;
	}): Promise<SessionArchiveExportResult>;
	import(input?: { passphrase?: string }): Promise<SessionArchiveImportResult>;
}
