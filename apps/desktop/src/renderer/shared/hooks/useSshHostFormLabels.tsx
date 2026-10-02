// Copyright The Open Forge contributors.
import type { SshHostFormFieldsLabels } from "@vetta-org/theme-ui/settings";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export function useSshHostFormLabels(): SshHostFormFieldsLabels {
	const { t } = useTranslation("settings");
	return useMemo(
		() => ({
			fieldTarget: t("sshFieldTarget"),
			fieldTargetHint: t("sshFieldTargetHint"),
			fieldLabel: t("sshFieldLabel"),
			fieldLabelHint: t("sshFieldLabelHint"),
			fieldPort: t("sshFieldPort"),
			fieldIdentityFile: t("sshFieldIdentityFile"),
			fieldIdentityFileHint: t("sshFieldIdentityFileHint"),
			targetPlaceholder: t("sshTargetPlaceholder"),
			identityFilePlaceholder: t("sshIdentityFilePlaceholder"),
		}),
		[t],
	);
}
