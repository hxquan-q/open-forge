import { i18n } from "@shared/i18n";

/** Thin conversation-domain helpers around the main-process session archive API. */

export async function exportPortableSessionArchive(input: {
	readonly sessionPath: string;
	readonly defaultFileName?: string;
}): Promise<{ saved: boolean; path?: string }> {
	const passphrase = window.prompt(i18n.t("chat:chatView.archiveExport.passphrasePrompt"), "") ?? "";
	return window.vetta.sessionArchive.export({
		sessionPath: input.sessionPath,
		passphrase,
		defaultFileName: input.defaultFileName,
	});
}

export async function importPortableSessionArchive(): Promise<{
	canceled: boolean;
	messageKey: "canceled" | "doneSkip" | "doneCopy";
}> {
	const passphrase = window.prompt(i18n.t("chat:chatView.archiveImport.passphrasePrompt"), "") ?? "";
	const result = await window.vetta.sessionArchive.import({ passphrase });
	if (result.canceled) {
		return { canceled: true, messageKey: "canceled" };
	}
	const skipped = result.decisions.every((d) => d.conflict.action === "skip-idempotent");
	return { canceled: false, messageKey: skipped ? "doneSkip" : "doneCopy" };
}
