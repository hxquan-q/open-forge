// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import type { Project } from "@shared/store/atoms";
import { INITIAL_SPACES, spacesAtom } from "@shared/store/spaces";
import { render } from "@testing-library/react";
import type { ContextMenuNode } from "@vetta-org/theme-ui/shared";
import { createStore, Provider } from "jotai";
import type { JSX, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectContextMenu } from "./ProjectContextMenu";

/**
 * 项目右键菜单的「移动到工作空间」接线门控（ADR-0156）：
 * 默认「对话」区与批量项目组不归属任何空间，不提供移动入口；普通项目有，
 * 且排在面板追加的 extraItems 之后（面板条目在前，移动入口收尾）。
 */

const captured = vi.hoisted(() => ({ props: null as null | { extraItems?: readonly ContextMenuNode[] } }));
const panelItems = vi.hoisted(() => [
	{ kind: "item", id: "panel-extra", label: "面板项", onSelect: () => {} } as ContextMenuNode,
]);

vi.mock("../hooks/useProjectContextMenuModel", () => ({
	useProjectContextMenuModel: () => ({}),
}));

vi.mock("@vetta-org/theme-ui/project", () => ({
	ProjectContextMenuView: (props: { extraItems?: readonly ContextMenuNode[] }): null => {
		captured.props = props;
		return null;
	},
}));

vi.mock("@tanstack/react-router", () => ({
	useLocation: (options?: { select?: (location: { pathname: string }) => unknown }) => {
		const location = { pathname: "/" };
		return options?.select ? options.select(location) : location;
	},
}));
vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

function renderMenu(project: Project, extraItems?: readonly ContextMenuNode[]) {
	const store = createStore();
	store.set(spacesAtom, INITIAL_SPACES);
	const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
		<Provider store={store}>{children}</Provider>
	);
	return render(
		<ProjectContextMenu
			x={10}
			y={10}
			project={project}
			onClose={() => {}}
			onArchive={() => {}}
			onRemove={() => {}}
			onDelete={() => {}}
			extraItems={extraItems}
		/>,
		{ wrapper },
	);
}

describe("ProjectContextMenu 的移动入口接线", () => {
	beforeEach(() => {
		captured.props = null;
	});

	it("普通项目：移动子菜单排在面板 extraItems 之后", () => {
		renderMenu({ cwd: "/w/alpha", name: "Alpha", sessionCount: 0, type: "normal" }, panelItems);
		expect(captured.props?.extraItems?.map((item) => item.id)).toEqual(["panel-extra", "move-space"]);
	});

	it("默认「对话」区没有移动入口，只透传面板 extraItems", () => {
		renderMenu({ cwd: "/conv", name: "对话", sessionCount: 0, type: "normal", isDefault: true }, panelItems);
		expect(captured.props?.extraItems?.map((item) => item.id)).toEqual(["panel-extra"]);
	});

	it("批量项目组没有移动入口", () => {
		renderMenu({ cwd: "batch-1", name: "批量", sessionCount: 0, type: "batch" }, panelItems);
		expect(captured.props?.extraItems?.map((item) => item.id)).toEqual(["panel-extra"]);
	});
});
