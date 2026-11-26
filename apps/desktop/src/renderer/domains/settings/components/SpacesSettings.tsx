// Copyright The Open Forge contributors.
import { SpaceGlyph } from "@domains/project/components/sidebar/SpaceSwitcher";
import { confirmDialogAtom } from "@shared/store/atoms";
import {
	forgetSpace,
	MAIN_SPACE,
	MAIN_SPACE_ICON,
	reorderSpace,
	spaceEditorAtom,
	spacesAtom,
} from "@shared/store/spaces";
import { SpacesSettingsView } from "@vetta-org/theme-ui/settings";
import { useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";

const SPACES_SECTION = { id: "workspaces", titleKey: "spaces.settingsTitle" } as const;
/** 顶部讲解的四条，顺序即阅读顺序：怎么分 → 怎么切 → 切回来什么样 → 不会动什么。 */
const SPACES_FEATURES = [
	{ key: "group", icon: "icon-[solar--widget-linear]" },
	{ key: "switch", icon: "icon-[solar--square-transfer-horizontal-linear]" },
	{ key: "resume", icon: "icon-[solar--history-linear]" },
	{ key: "safe", icon: "icon-[solar--shield-check-linear]" },
] as const;

/** 设置 → 工作空间：增删改排只做归属；移除走非破坏档——空间消失，归属并回主工作空间。 */
export function SpacesSettings(): JSX.Element {
	const { t } = useTranslation("project");
	const state = useAtomValue(spacesAtom);
	const setSpaces = useSetAtom(spacesAtom);
	const edit = useSetAtom(spaceEditorAtom);
	const setConfirm = useSetAtom(confirmDialogAtom);
	return (
		<SpacesSettingsView
			section={SPACES_SECTION}
			features={SPACES_FEATURES.map(({ icon, key }) => ({
				icon,
				title: t(`spaces.intro.${key}.title`),
				description: t(`spaces.intro.${key}.description`),
			}))}
			labels={{
				title: t("spaces.settingsTitle"),
				subtitle: t("spaces.intro.subtitle"),
				featuresTitle: t("spaces.intro.title"),
				listTitle: t("spaces.intro.listTitle"),
				newSpace: t("spaces.new"),
				edit: (name) => t("spaces.spaceEdit", { name }),
				remove: (name) => t("spaces.spaceRemove", { name }),
				main: { id: MAIN_SPACE, name: t("spaces.main"), icon: <SpaceGlyph icon={MAIN_SPACE_ICON} /> },
			}}
			spaces={state.spaces.map((space) => ({
				id: space.id,
				name: space.name,
				icon: <SpaceGlyph icon={space.icon} />,
			}))}
			onCreate={() => edit({})}
			onEdit={(id) => {
				const space = state.spaces.find((item) => item.id === id);
				if (space) edit({ space });
			}}
			onRemove={(id) => {
				const space = state.spaces.find((item) => item.id === id);
				if (!space) return;
				setConfirm({
					title: t("spaces.removeTitle", { name: space.name }),
					message: t("spaces.removeDescription"),
					confirmLabel: t("spaces.remove"),
					cancelLabel: t("spaces.cancel"),
					onConfirm: () => {
						// 非破坏档：forgetSpace 本身就会摘归属、把正在该空间的选中态落回主工作空间；
						// 破坏性移除（连同内容删除）属 TASK-0526 切片③，这里不提供入口。
						setSpaces((current) => forgetSpace(current, id));
					},
				});
			}}
			onReorder={(source, target) => setSpaces((current) => reorderSpace(current, source, target))}
		/>
	);
}