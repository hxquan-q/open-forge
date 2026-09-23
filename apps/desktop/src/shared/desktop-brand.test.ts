// Copyright The Open Forge contributors.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import {
	DESKTOP_BRAND,
	DESKTOP_BRAND_REPLACEMENTS,
	initDesktopI18n,
	replaceDesktopBrandText,
} from "./desktop-brand.js";
import { NAMESPACES, resources } from "./i18n/resources.js";

const desktopRoot = join(import.meta.dirname, "..", "..");

function readDesktopSource(relativePath: string): string {
	return readFileSync(join(desktopRoot, relativePath), "utf8");
}

describe("Desktop brand layer", () => {
	it("replaces only explicitly approved product names", () => {
		expect(DESKTOP_BRAND_REPLACEMENTS).toEqual([
			{ from: "Open Vetta", to: "Open Forge" },
			{ from: "Vetta", to: "Open Forge" },
		]);
		expect(replaceDesktopBrandText("Open Vetta and Vetta's app")).toBe("Open Forge and Open Forge's app");
		expect(replaceDesktopBrandText("Vettalabs and lowercase vetta")).toBe("Vettalabs and lowercase vetta");
	});

	it("preserves compatibility names and paths", () => {
		const compatibilityText =
			"APP_RUNTIME_NAME=vetta; ~/.vetta; vetta://oauth/callback; .vettapkg; VETTA_*; " +
			"@vetta/*; vetta:settings; vetta.remote.v1; X-Vetta-Trace";

		expect(replaceDesktopBrandText(compatibilityText)).toBe(compatibilityText);
	});

	it("uses the shared branding initializer in every Desktop i18n entrypoint", () => {
		for (const entrypoint of [
			"src/main/i18n/index.ts",
			"src/renderer/shared/i18n/index.ts",
			"src/renderer/quickpanel/i18n.ts",
			"src/renderer/onboarding/i18n.ts",
		]) {
			expect(readDesktopSource(entrypoint)).toContain("initDesktopI18n(");
		}
	});

	it("renders the approved brand through Chinese and English translations", async () => {
		const i18n = createInstance();
		await initDesktopI18n(i18n, {
			resources,
			lng: "zh",
			fallbackLng: "zh",
			ns: NAMESPACES,
			defaultNS: "common",
			initAsync: false,
			interpolation: { escapeValue: false },
			returnNull: false,
		});

		expect(i18n.t("common:appName")).toBe(DESKTOP_BRAND.displayName);
		expect(i18n.t("main:menu.app.about")).toBe("关于 Open Forge");
		expect(i18n.t("main:menu.app.credits")).toContain("NOTICE");
		expect(i18n.t("chat:inputBar.placeholder.thinking")).toBe("Open Forge 正在思考…");

		await i18n.changeLanguage("en");
		expect(i18n.t("common:appName")).toBe(DESKTOP_BRAND.displayName);
		expect(i18n.t("main:menu.app.about")).toBe("About Open Forge");
		expect(i18n.t("main:menu.app.credits")).toContain("NOTICE");
		expect(i18n.t("chat:inputBar.placeholder.thinking")).toBe("Open Forge is thinking…");
	});

	it("keeps the frozen packaging identities while sourcing display names from Desktop brand", () => {
		const preparePack = readDesktopSource("scripts/prepare-pack.js");
		const packagingLayout = readDesktopSource("scripts/desktop-packaging-layout.mjs");
		const linuxPackaging = readDesktopSource("scripts/linux-packaging-contract.mjs");

		expect(preparePack).toContain("productName: desktopBrand.displayName");
		expect(preparePack).toContain("executableName: desktopBrand.executableName");
		expect(preparePack).toContain('appId: "io.github.hxquanq.openforge"');
		expect(preparePack).toContain('schemes: ["openforge"]');
		expect(preparePack).toMatch(/artifactName:\s*"\$\{productName\}-\$\{version\}-win-\$\{arch\}\.\$\{ext\}"/);
		expect(preparePack).toContain("publish: [updatePublishConfig]");
		expect(packagingLayout).toMatch(/\$\{desktopBrand\.displayName\} Plugin Package/);
		expect(linuxPackaging).toContain("name: desktopBrand.displayName");
	});
});
