// Copyright The Open Forge contributors.
import type { RegisteredHeaderAction } from "@shared/store/plugin-atoms";
import type { LoadedPlugin } from "../runtime/plugin-loader";

export function publishHeaderActions(
	plugins: readonly Pick<LoadedPlugin, "id" | "name" | "headerActions">[],
): RegisteredHeaderAction[] {
	return plugins
		.flatMap((plugin) =>
			plugin.headerActions.map((contribution, index) => ({
				pluginId: plugin.id,
				pluginName: plugin.name,
				actionId: `plugin:${plugin.id}:${contribution.id}`,
				...(contribution.surfaces ? { surfaces: contribution.surfaces } : {}),
				...(contribution.pin ? { pin: contribution.pin } : {}),
				useAction: contribution.useAction,
				sortOrder: contribution.order ?? Number.MAX_SAFE_INTEGER,
				registrationIndex: index,
			})),
		)
		.sort(
			(left, right) =>
				left.sortOrder - right.sortOrder ||
				left.pluginId.localeCompare(right.pluginId) ||
				left.registrationIndex - right.registrationIndex,
		)
		.map(({ sortOrder: _sortOrder, registrationIndex: _registrationIndex, ...action }) => action);
}
