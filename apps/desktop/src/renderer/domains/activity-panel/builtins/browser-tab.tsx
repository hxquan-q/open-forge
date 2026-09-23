import { useTranslation } from "react-i18next";
import { BrowserPanel } from "../components/BrowserPanel";
import type { ActivityTabDefinition } from "../registry/types";

function BrowserActivityTab(): JSX.Element {
	return <BrowserPanel />;
}

export const browserTabDefinition: ActivityTabDefinition = {
	id: "browser",
	order: 15,
	removable: true,
	source: "builtin",
	retention: "pinned",
	useMeta: () => {
		const { t } = useTranslation("chat");
		return {
			label: t("browser.tab"),
			icon: "icon-[mdi--web]",
		};
	},
	component: BrowserActivityTab,
};
