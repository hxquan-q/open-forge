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

	it("serves the appshot helper name and bundle id from the shared brand source on both ends", () => {
		expect(DESKTOP_BRAND.appshotHelperName).toBe(`${DESKTOP_BRAND.displayName} Computer Use`);
		expect(DESKTOP_BRAND.appshotHelperBundleId).toBe("io.github.hxquanq.openforge.computer-use");

		for (const file of ["src/main/appshot/helper-resolver.ts", "scripts/build-appshot-helper.js"]) {
			const source = readDesktopSource(file);
			expect(source, file).toContain("appshotHelper");
			expect(source, file).not.toMatch(/\bVetta\b/);
		}
	});

	it("selects the branded main window in UI verification", () => {
		const source = readDesktopSource("scripts/ui-verification.mjs");
		expect(source).toContain("desktop-brand.json");
		expect(source).toContain("displayName");
		expect(source).not.toContain('title === "Vetta Desktop"');
		expect(source).not.toContain("[Vetta Desktop](");
	});

	it("renders Open Forge window titles in every renderer HTML entry", () => {
		for (const entry of [
			"src/renderer/index.html",
			"src/renderer/onboarding.html",
			"src/renderer/pet.html",
			"src/renderer/quickpanel.html",
			"src/renderer/remote-desktop-host.html",
			"src/renderer-ocr/index.html",
		]) {
			const html = readDesktopSource(entry);
			const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
			expect(title, entry).toContain(DESKTOP_BRAND.displayName);
			expect(title, entry).not.toMatch(/\bVetta\b/);
		}
	});

	it("keeps user-facing surfaces free of hardcoded legacy product names", () => {
		for (const file of [
			"src/main/tray-manager.ts",
			"src/main/mcp/mcp-oauth-service.ts",
			"src/main/abilities/open-marketplace/marketplace-plugin-artifact.ts",
			"src/main/abilities/open-marketplace/open-marketplace-mcp-runtime.ts",
			"src/main/abilities/open-marketplace/open-marketplace-service.ts",
			"src/main/ipc/project-export.ts",
			"src/main/cloud-bridge.ts",
			"src/main/skills/skill-market-install.ts",
			"src/main/conversations/desktop-conversation-service.ts",
			"src/main/app-actions/approval-broker.ts",
			"src/main/app-actions/search.ts",
			"src/main/im-host/binary-resolver.ts",
			"src/main/logger.ts",
			"src/main/media-generation/vetta-image-provider.ts",
			"src/main/ssh/askpass-assets.ts",
			"src/main/app-debug/conversation/definitions.ts",
			"src/main/app-debug/debug-info.ts",
			"src/renderer/domains/conversation/components/message-list/AssistantMessage.tsx",
			"src/renderer/domains/conversation/components/mcp-app/mcp-app-bridge.ts",
			"src/renderer/domains/conversation/hooks/useChatExportHostModel.ts",
			"src/renderer/domains/conversation/services/chat-html-export.ts",
			"src/renderer/domains/plugins/runtime/plugin-official-models.ts",
			"src/renderer/domains/settings/components/ImBridgeSettingsView.tsx",
			"src/renderer/domains/settings/components/useAccountSettingsModel.ts",
			"src/renderer/domains/settings/registry.ts",
			"src/renderer/shared/components/ModelSelect/useModelOptions.ts",
			// theme-ui 侧栏顶栏随 Desktop 一起发布，品牌名必须经 labels 由宿主注入。
			"../../packages/theme-ui/src/sidebar/SidebarTopBar.tsx",
		]) {
			expect(readDesktopSource(file), file).not.toMatch(/\bVetta\b/);
		}
	});
});
