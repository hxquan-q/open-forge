// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { i18n, initI18n } from "@shared/i18n";
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveDesktopBrandName } from "@/shared/desktop-brand";
import { SidebarTopBar } from "./SidebarTopBar";

/**
 * 品牌回归合同：侧栏顶栏是用户第一眼看到的界面，产品名必须来自宿主 i18n
 * （common:appName 经 desktop-brand post-processor 改写），不允许在 theme-ui
 * 或适配层硬编码遗留品牌名。该用例在旧实现（字面量 "Vetta"）下必然失败。
 */
beforeAll(() => {
	initI18n();
});

describe("SidebarTopBar 品牌区", () => {
	it("用户在侧栏看到的是当前产品品牌名而非遗留名称", async () => {
		await i18n.changeLanguage("zh");
		render(<SidebarTopBar floating={false} />);

		// 展示名随档案与界面语言（默认外部分发档的中文界面为「小爱ai」）。
		expect(screen.getByText(resolveDesktopBrandName(i18n.language))).toBeTruthy();
		expect(screen.queryByText("Vetta")).toBeNull();
	});

	it("品牌名旁渲染当前品牌档案的图标（alt 为空，避免与名称重复朗读）", () => {
		render(<SidebarTopBar floating={false} />);

		const brandIcon = document.querySelector("img");
		expect(brandIcon).toBeTruthy();
		expect(brandIcon?.getAttribute("src")).toMatch(/brand-icon/);
		expect(brandIcon?.getAttribute("alt")).toBe("");
	});
});
