/** Thin conversation-domain helpers around the main-process session archive API. */

export async function exportPortableSessionArchive(input: {
	readonly sessionPath: string;
	readonly passphrase: string;
	readonly defaultFileName?: string;
}): Promise<{ saved: boolean; path?: string }> {
	return window.vetta.sessionArchive.export({
		sessionPath: input.sessionPath,
		passphrase: input.passphrase,
		defaultFileName: input.defaultFileName,
	});
}

export async function exportPortableProjectSessionArchive(input: {
	readonly cwd: string;
	readonly passphrase: string;
	readonly defaultFileName?: string;
}): Promise<{
	saved: boolean;
	path?: string;
	sessionCount?: number;
	reason?: "no-sessions";
}> {
	return window.vetta.sessionArchive.exportProject({
		cwd: input.cwd,
		passphrase: input.passphrase,
		defaultFileName: input.defaultFileName,
	});
}

export async function importPortableSessionArchive(passphrase: string): Promise<{
	canceled: boolean;
	messageKey: "canceled" | "doneSkip" | "doneCopy";
}> {
	const result = await window.vetta.sessionArchive.import({ passphrase });
	if (result.canceled) {
		return { canceled: true, messageKey: "canceled" };
	}
	const skipped = result.decisions.every((d) => d.conflict.action === "skip-idempotent");
	return { canceled: false, messageKey: skipped ? "doneSkip" : "doneCopy" };
}
