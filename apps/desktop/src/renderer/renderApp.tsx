// Modified by The Open Forge contributors.
import { RouterProvider } from "@tanstack/react-router";
import { ThemeHostProvider } from "@vetta-org/theme-sdk";
import { StrictMode } from "react";
import type { Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { resolveDesktopBrandName } from "@/shared/desktop-brand";
import { router } from "./router";
import { i18n, initI18n } from "./shared/i18n";
import { initializeHostedRoutes } from "./initialize-hosted-routes";
import { desktopThemeHost } from "./shared/theme/desktopThemeHost";
import { ThemeRuntimeProvider } from "./shared/theme/runtime";
import { ThemeColorOverrideBridge } from "./shared/theme/ThemeColorOverrideBridge";
import { ThemeController } from "./shared/theme/ThemeController";
import { initializeProductAnalytics } from "./telemetry/product-analytics";

export function renderApp(root: Root): void {
	initializeProductAnalytics();
	// zh（默认）同步就绪；en 初值时先按需装载 en catalog 再挂载，保证首帧即正确语言。
	const i18nReady = initI18n();
	const mount = () => {
		// 窗口标题随品牌口径与界面语言（index.html 的静态标题只覆盖默认口径）。
		const applyBrandTitle = () => {
			document.title = resolveDesktopBrandName(i18n.language);
		};
		applyBrandTitle();
		i18n.on("languageChanged", applyBrandTitle);
		initializeHostedRoutes();

		root.render(
			<StrictMode>
				<I18nextProvider i18n={i18n}>
					<ThemeHostProvider host={desktopThemeHost}>
						<ThemeRuntimeProvider>
							<ThemeController />
							<ThemeColorOverrideBridge />
							<RouterProvider router={router} />
						</ThemeRuntimeProvider>
					</ThemeHostProvider>
				</I18nextProvider>
			</StrictMode>,
		);
	};
	if (i18nReady) {
		void i18nReady.then(mount);
		return;
	}
	mount();
}
