// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { i18n, initI18n } from "@shared/i18n";
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { DESKTOP_BRAND } from "@/shared/desktop-brand";
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

		expect(screen.getByText(DESKTOP_BRAND.displayName)).toBeTruthy();
		expect(screen.queryByText("Vetta")).toBeNull();
	});
});
