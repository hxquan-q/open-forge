// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SidebarNavItem } from "@vetta-org/theme-sdk/sidebar";
import { SidebarNavigation } from "./SidebarNavigation";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const noop = (): void => {};

function routeItem(key: string, label: string): SidebarNavItem {
	return {
		key,
		type: "route",
		path: "/automation",
		label,
		icon: "icon-[solar--magic-stick-3-linear]",
		active: false,
	};
}

/** 版块入口（如 Allstar 自主开发）的最小形状：custom 项 + locked，无 path。 */
const sectionEntry: SidebarNavItem = {
	key: "allstar-dev",
	type: "custom",
	label: "Allstar自主开发",
	labelKey: "sidebar.nav.allstarDev",
	icon: "icon-[solar--code-linear]",
	active: false,
	title: "Allstar自主开发",
	locked: true,
};

describe("SidebarNavigation 版块入口", () => {
	let root: Root;
	let container: HTMLDivElement;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("sectionEntry 渲染为「更多」触发器之后的最后一行，点击回调拿到同一项", () => {
		const onSectionEntryClick = vi.fn();
		act(() => {
			root.render(
				<SidebarNavigation
					indicatorBounds={null}
					items={[routeItem("pinned-1", "置顶项")]}
					moreItems={[routeItem("more-1", "收纳项")]}
					moreLabel="更多"
					sectionEntry={sectionEntry}
					onSectionEntryClick={onSectionEntryClick}
					onItemClick={noop}
					setItemRef={() => noop}
				/>,
			);
		});

		const nav = container.querySelector("nav");
		expect(nav).not.toBeNull();
		const buttons = [...nav!.querySelectorAll("button")];
		const moreTrigger = buttons.find((button) => button.textContent === "更多");
		const sectionButton = buttons.find((button) => button.textContent === "Allstar自主开发");
		expect(moreTrigger).toBeDefined();
		expect(sectionButton).toBeDefined();
		// 版块入口固定排在「更多」之后：它是整列导航的最后一个按钮。
		expect(buttons[buttons.length - 1]).toBe(sectionButton);
		expect(buttons.indexOf(moreTrigger!)).toBeLessThan(buttons.indexOf(sectionButton!));

		act(() => {
			sectionButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onSectionEntryClick).toHaveBeenCalledWith(sectionEntry);
	});

	it("缺省 sectionEntry 时不渲染额外行", () => {
		act(() => {
			root.render(
				<SidebarNavigation
					indicatorBounds={null}
					items={[routeItem("pinned-1", "置顶项")]}
					moreItems={[routeItem("more-1", "收纳项")]}
					moreLabel="更多"
					onItemClick={noop}
					setItemRef={() => noop}
				/>,
			);
		});
		expect(container.querySelector("nav")!.textContent).not.toContain("Allstar");
	});
});
