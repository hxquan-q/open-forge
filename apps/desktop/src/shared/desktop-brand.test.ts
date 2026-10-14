// Copyright The Open Forge contributors.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createInstance } from "i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	DESKTOP_BRAND,
	DESKTOP_BRAND_REPLACEMENTS,
	initDesktopI18n,
	replaceDesktopBrandText,
} from "./desktop-brand.js";
import { NAMESPACES, resources } from "./i18n/resources.js";

// 默认档已切换为外部分发（REQ-0011）；本文件第一块合同围绕 self 档的归一规则，
// 因此在模块导入前显式钉住 self 档；档案三态（未设置 / 显式 self / 显式 distribution）
// 在第二块内自行覆盖。
vi.hoisted(() => {
	process.env.VETTA_BRAND_PROFILE = "self";
});

const desktopRoot = join(import.meta.dirname, "..", "..");

function readDesktopSource(relativePath: string): string {
	return readFileSync(join(desktopRoot, relativePath), "utf8");
}

/** 递归收集 locale 资源里的字符串值（跳过 key，key 里的驼峰标识不参与展示）。 */
function collectLocaleStrings(value: unknown, out: string[] = []): string[] {
	if (typeof value === "string") {
		out.push(value);
	} else if (Array.isArray(value)) {
		for (const item of value) collectLocaleStrings(item, out);
	} else if (value !== null && typeof value === "object") {
		for (const item of Object.values(value)) collectLocaleStrings(item, out);
	}
	return out;
}

describe("Desktop brand layer", () => {
	it("replaces only explicitly approved product names", () => {
		expect(DESKTOP_BRAND_REPLACEMENTS).toEqual([
			{ from: "Open Vetta", to: "Open Forge" },
			{ from: "Vetta Desktop", to: "Open Forge" },
			{ from: "Vetta", to: "Open Forge" },
		]);
		expect(replaceDesktopBrandText("Open Vetta and Vetta's app")).toBe("Open Forge and Open Forge's app");
		// 组合词整段归一：不留「Open Forge Desktop」这种半截替换。
		expect(replaceDesktopBrandText("请通过 Vetta Desktop 的应用能力查询")).toBe("请通过 Open Forge 的应用能力查询");
		expect(replaceDesktopBrandText("Vetta Desktop App")).toBe("Open Forge App");
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
		// 打包身份与 vite 同开关选档：分发档安装器身份（产品名/安装器显示名）随档案，
		// AppId / 安装目录 / 可执行名保持冻结。
		expect(preparePack).toContain("desktop-brand.distribution.json");
		expect(readDesktopSource("build/installer.iss")).toContain("{#AppDisplayName}");
		expect(readDesktopSource("scripts/build-inno-installer.mjs")).toContain("resolveInnoInstallerIdentity");
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

	it("静态 HTML 标题覆盖默认口径（外部分发档案），运行时按档案与语言覆盖", () => {
		const defaultBrand = JSON.parse(
			readFileSync(join(desktopRoot, "src/shared/desktop-brand.distribution.json"), "utf8"),
		) as { displayName: string };
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
			expect(title, entry).toContain(defaultBrand.displayName);
			expect(title, entry).not.toMatch(/\bVetta\b/);
		}
	});

	it("四个决策点与辅助脚本共享同一默认档归一（未设置 = distribution，显式 self 回 Open Forge）", () => {
		expect(readDesktopSource("src/shared/desktop-brand.ts")).toContain(
			'process.env.VETTA_BRAND_PROFILE === "self" ? "self" : "distribution"',
		);
		for (const file of ["vite.config.ts", "vite.main.config.ts"]) {
			expect(readDesktopSource(file), file).toContain(
				'env.VETTA_BRAND_PROFILE === "self" ? "self" : "distribution"',
			);
		}
		const preparePack = readDesktopSource("scripts/prepare-pack.js");
		expect(preparePack).toContain('process.env.VETTA_BRAND_PROFILE === "self"');
		expect(preparePack).toContain('if (process.env.VETTA_BRAND_PROFILE !== "self")');
		for (const file of [
			"scripts/build-appshot-helper.js",
			"scripts/desktop-packaging-layout.mjs",
			"scripts/linux-packaging-contract.mjs",
			"scripts/ui-verification.mjs",
		]) {
			expect(readDesktopSource(file), file).toContain('process.env.VETTA_BRAND_PROFILE === "self"');
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

describe("品牌档案（VETTA_BRAND_PROFILE 构建期开关）", () => {
	const originalProfile = process.env.VETTA_BRAND_PROFILE;

	afterEach(() => {
		if (originalProfile === undefined) delete process.env.VETTA_BRAND_PROFILE;
		else process.env.VETTA_BRAND_PROFILE = originalProfile;
		vi.resetModules();
	});

	it("用户不设置开关时拿到外部分发口径：Allstr ai / 小爱ai，且 Open Forge 字样被归一", async () => {
		delete process.env.VETTA_BRAND_PROFILE;
		vi.resetModules();
		const brand = await import("./desktop-brand.js");

		expect(brand.DESKTOP_BRAND_PROFILE).toBe("distribution");
		expect(brand.DESKTOP_BRAND.displayName).toBe("Allstr ai");
		expect(brand.resolveDesktopBrandName("zh")).toBe("小爱ai");
		expect(brand.replaceDesktopBrandText("Open Vetta and Vetta's app")).toBe("Allstr ai and Allstr ai's app");
		expect(brand.replaceDesktopBrandText("关于 Open Forge", "zh")).toBe("关于 小爱ai");
	});

	it("显式 self 档回到 Open Forge 品牌与既有归一规则", async () => {
		process.env.VETTA_BRAND_PROFILE = "self";
		vi.resetModules();
		const brand = await import("./desktop-brand.js");

		expect(brand.DESKTOP_BRAND_PROFILE).toBe("self");
		expect(brand.DESKTOP_BRAND.displayName).toBe("Open Forge");
		expect(brand.resolveDesktopBrandName("zh")).toBe("Open Forge");
		expect(brand.replaceDesktopBrandText("Open Vetta and Vetta's app")).toBe("Open Forge and Open Forge's app");
		expect(brand.replaceDesktopBrandText("关于 Open Forge", "zh")).toBe("关于 Open Forge");
	});

	it("外部分发档：英文展示 Allstr ai，中文界面展示 小爱ai，且 Open Forge 字样被归一", async () => {
		process.env.VETTA_BRAND_PROFILE = "distribution";
		vi.resetModules();
		const brand = await import("./desktop-brand.js");

		expect(brand.DESKTOP_BRAND_PROFILE).toBe("distribution");
		expect(brand.DESKTOP_BRAND.displayName).toBe("Allstr ai");
		expect(brand.resolveDesktopBrandName(undefined)).toBe("Allstr ai");
		expect(brand.resolveDesktopBrandName("en")).toBe("Allstr ai");
		expect(brand.resolveDesktopBrandName("zh-CN")).toBe("小爱ai");
		expect(brand.replaceDesktopBrandText("About Open Forge", "en")).toBe("About Allstr ai");
		expect(brand.replaceDesktopBrandText("关于 Open Forge 和 Open Forge 的能力", "zh")).toBe(
			"关于 小爱ai 和 小爱ai 的能力",
		);
		// 分发档同样不得碰兼容名与路径（协议、数据目录、文件扩展名）。
		const compatibilityText =
			"APP_RUNTIME_NAME=vetta; ~/.vetta; vetta://oauth/callback; .vettapkg; VETTA_*; @vetta/*; vetta:settings";
		expect(brand.replaceDesktopBrandText(compatibilityText, "zh")).toBe(compatibilityText);
	});

	it("外部分发档经 i18n post-processor 按界面语言渲染品牌，无需改动任何 locale 文件", async () => {
		process.env.VETTA_BRAND_PROFILE = "distribution";
		vi.resetModules();
		const { initDesktopI18n } = await import("./desktop-brand.js");
		const instance = createInstance();
		await initDesktopI18n(instance, {
			resources,
			lng: "zh",
			fallbackLng: "zh",
			ns: NAMESPACES,
			defaultNS: "common",
			initAsync: false,
			interpolation: { escapeValue: false },
			returnNull: false,
		});

		expect(instance.t("common:appName")).toBe("小爱ai");
		expect(instance.t("main:menu.app.about")).toBe("关于 小爱ai");
		await instance.changeLanguage("en");
		expect(instance.t("common:appName")).toBe("Allstr ai");
		expect(instance.t("main:menu.app.about")).toBe("About Allstr ai");
	});

	it("外部分发档打包图标随档案覆盖暂存 build/，且品牌资产已入库可复现构建", () => {
		const preparePack = readDesktopSource("scripts/prepare-pack.js");
		expect(preparePack).toContain('"brand", "distribution"');
		// exe 图标 / 安装器图标 / 运行时窗口与托盘图标（window-manager）同源自暂存 build/icon.*，
		// 暂存期覆盖一处即全链生效；文件名保持不变以维持兼容标识。
		for (const icon of ["icon.ico", "icon.png", "icon.icns", "icon-dock.png"]) {
			expect(preparePack, icon).toContain(`"${icon}"`);
			const asset = readFileSync(join(desktopRoot, "build", "brand", "distribution", icon));
			expect(asset.length, icon).toBeGreaterThan(1000);
		}
		// 容器魔数：ICO（reserved=0, type=1）与 ICNS（"icns"）
		const ico = readFileSync(join(desktopRoot, "build", "brand", "distribution", "icon.ico"));
		expect(ico.readUInt16LE(0)).toBe(0);
		expect(ico.readUInt16LE(2)).toBe(1);
		const icns = readFileSync(join(desktopRoot, "build", "brand", "distribution", "icon.icns"));
		expect(icns.toString("ascii", 0, 4)).toBe("icns");
	});

	it.each(["self", "distribution"] as const)(
		"%s 档：两种界面语言下的全部文案渲染后都不含遗留品牌名",
		async (profile) => {
			process.env.VETTA_BRAND_PROFILE = profile;
			vi.resetModules();
			const brand = await import("./desktop-brand.js");

			const values = collectLocaleStrings(resources);
			expect(values.length).toBeGreaterThan(0);
			for (const language of ["zh", "en"]) {
				for (const value of values) {
					expect(brand.replaceDesktopBrandText(value, language), `${profile}/${language}: ${value}`).not.toMatch(
						/\bVetta\b/,
					);
				}
			}
		},
	);

	it("两档共用冻结的兼容标识（可执行名 / bundleId），分发档归一全部遗留名且不与自己冲突", () => {
		const selfSource = JSON.parse(readFileSync(join(desktopRoot, "src/shared/desktop-brand.json"), "utf8")) as {
			displayName: string;
			executableName: string;
			appshotHelperBundleId: string;
		};
		const distributionSource = JSON.parse(
			readFileSync(join(desktopRoot, "src/shared/desktop-brand.distribution.json"), "utf8"),
		) as {
			displayName: string;
			displayNameLocalized?: Record<string, string>;
			executableName: string;
			appshotHelperBundleId: string;
			legacyProductNames: string[];
		};

		expect(distributionSource.executableName).toBe(selfSource.executableName);
		expect(distributionSource.appshotHelperBundleId).toBe(selfSource.appshotHelperBundleId);
		expect(distributionSource.displayName).not.toBe(selfSource.displayName);
		expect(distributionSource.legacyProductNames).toEqual(
			expect.arrayContaining(["Open Vetta", "Vetta", "Open Forge"]),
		);
		expect(distributionSource.legacyProductNames).not.toContain(distributionSource.displayName);
		expect(distributionSource.displayNameLocalized?.zh).toBe("小爱ai");
	});
});
