// Copyright The Open Forge contributors.
import { ArchivedSessionsSettingsView as ThemeArchivedSessionsSettingsView } from "@vetta-org/theme-ui/settings";
import { SETTINGS_SECTION } from "../registry";
import type { ArchivedSessionsSettingsModel } from "./useArchivedSessionsSettingsModel";

export interface ArchivedSessionsSettingsViewProps {
	model: ArchivedSessionsSettingsModel;
}

export function ArchivedSessionsSettingsView({ model }: ArchivedSessionsSettingsViewProps): JSX.Element {
	return (
		<ThemeArchivedSessionsSettingsView
			labels={model.labels}
			sessions={model.sessions}
			section={SETTINGS_SECTION["archived-sessions"]}
			onUnarchive={(path) => void model.actions.unarchive(path)}
			onDelete={(path) => model.actions.delete(path)}
		/>
	);
}
