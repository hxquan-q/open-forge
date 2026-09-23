// Copyright The Open Forge contributors.
import { useTranslation } from "react-i18next";
import { CanvasTabPanel } from "../components/canvas-tab/CanvasTabPanel";
import type { ActivityTabDefinition } from "../registry/types";

function CanvasActivityTab(): JSX.Element {
	return <CanvasTabPanel />;
}

export const canvasTabDefinition: ActivityTabDefinition = {
	id: "canvas",
	// Between file(0) and browser(15); batch progress already occupies 10.
	order: 8,
	removable: true,
	source: "builtin",
	retention: "warm",
	useMeta: () => {
		const { t } = useTranslation("chat");
		return {
			label: t("activityPanel.tabs.canvas"),
			icon: "icon-[solar--notes-linear]",
		};
	},
	component: CanvasActivityTab,
};
