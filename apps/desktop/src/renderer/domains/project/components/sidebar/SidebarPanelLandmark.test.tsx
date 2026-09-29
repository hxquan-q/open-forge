// @vitest-environment jsdom
/**
 * 侧边栏整栏内容的 landmark 合同：axe `region`（BUG-0039）要求可见内容落在地标内。
 * 面板承载品牌、导航与项目区，宿主经 `label` 下发可访问名，读屏据此报出区域边界。
 */
import { cleanup, render, screen } from "@testing-library/react";
import { SidebarPanel } from "@vetta-org/theme-ui/sidebar";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

describe("SidebarPanel 的 landmark 语义", () => {
	it("整栏是 complementary landmark，label 是它的可访问名", () => {
		render(
			<SidebarPanel label="侧边栏" onResize={() => {}} onResizeEnd={() => {}} width={300}>
				<div>侧边栏内容</div>
			</SidebarPanel>,
		);

		const region = screen.getByRole("complementary", { name: "侧边栏" });
		expect(region.textContent).toContain("侧边栏内容");
	});
});
