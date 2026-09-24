// Copyright The Open Forge contributors.
import { WORKSPACE_MODE_ICON } from "@domains/workspace-mode";
import type { WorkspaceMode } from "@shared/store/atoms";
import { useTranslation } from "react-i18next";

export function NewSessionWorkspaceHint({ mode }: { readonly mode: WorkspaceMode }): JSX.Element {
	const { t } = useTranslation("chat");
	return (
		<p
			role="status"
			data-testid="new-session-workspace-hint"
			className="flex items-start gap-1.5 text-[12px] leading-5 text-muted-foreground"
		>
			<span className={`${WORKSPACE_MODE_ICON[mode]} mt-0.5 h-3.5 w-3.5 shrink-0`} aria-hidden />
			<span>{t(`newSession.workspace.hint.${mode}`)}</span>
		</p>
	);
}
