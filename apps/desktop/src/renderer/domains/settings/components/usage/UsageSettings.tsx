// Modified by The Open Forge contributors.
import { UsageSettingsView } from "./UsageSettingsView";
import { useUsageSettingsModel } from "./useUsageSettingsModel";

export function UsageSettings(): JSX.Element {
	return <UsageSettingsView model={useUsageSettingsModel()} />;
}
