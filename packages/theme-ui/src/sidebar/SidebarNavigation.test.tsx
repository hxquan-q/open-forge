// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SidebarNavItem } from "@vetta-org/theme-sdk/sidebar";
import { SidebarNavigation } from "./SidebarNavigation";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

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

const allstarItem: SidebarNavItem = {
	key: "allstar-dev",
	type: "custom",
	label: "Allstar自主开发",
	labelKey: "sidebar.nav.allstarDev",
	icon: "icon-[solar--code-linear]",
	active: false,
	title: "Allstar自主开发",
};

const navCustomizeLabels = {
	pinnedTitle: "置顶",
	moreTitle: "更多",
	pin: "置顶",
	unpin: "取消置顶",
	pinFull: "置顶区已满",
	reset: "恢复默认",
};

const noop = (): void => {};

describe("SidebarNavigation standard navigation items", () => {
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

	it("renders Allstar in normal tab order, supports drag, and dispatches the standard click", () => {
		const onItemClick = vi.fn();
		act(() => {
			root.render(
				<SidebarNavigation
					canPinMore
					indicatorBounds={null}
					items={[routeItem("gallery", "原型设计"), allstarItem, routeItem("following", "后续页签")]}
					navCustomizeLabels={navCustomizeLabels}
					moreItems={[]}
					onNavMove={vi.fn()}
					onItemClick={onItemClick}
					setItemRef={() => noop}
				/>,
			);
		});

		const buttons = [...container.querySelectorAll("nav button")];
		expect(buttons.map((button) => button.textContent)).toEqual(["原型设计", "Allstar自主开发", "后续页签"]);
		const allstarButton = buttons[1];
		expect(allstarButton?.parentElement?.getAttribute("draggable")).toBe("true");

		act(() => allstarButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
		expect(onItemClick).toHaveBeenCalledWith(allstarItem);
	});
});
