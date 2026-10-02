// Copyright The Open Forge contributors.
import type { SshHostFormInput } from "@preload/api-types/ssh";
import type { SshHostFormValues } from "@vetta-org/theme-ui/settings";

export const EMPTY_SSH_HOST_FORM: SshHostFormValues = { label: "", target: "", port: "", identityFile: "" };

/** Both entry points leave omitted identity/port values to the existing SSH configuration. */
export function toSshHostFormInput(form: SshHostFormValues): SshHostFormInput {
	const port = form.port.trim();
	return {
		label: form.label.trim() || form.target.trim(),
		target: form.target.trim(),
		...(port ? { port: Number(port) } : {}),
		...(form.identityFile.trim() ? { identityFile: form.identityFile.trim() } : {}),
	};
}
