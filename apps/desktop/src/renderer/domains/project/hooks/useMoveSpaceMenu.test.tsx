// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import {
	INITIAL_SPACES,
	MAIN_SPACE,
	type Space,
	spaceEditorAtom,
	type SpaceItem,
	spacesAtom,
} from "@shared/store/spaces";
import { act, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { JSX, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMoveSpaceMenu } from "./useMoveSpaceMenu";

/**
 * 「移动到工作空间」子菜单：目标列表 = 主空间 + 全部自定义空间，当前归属勾选；
 * 选中后归属经 moveSpaceItem 改写（位置记忆跟随），「新工作空间」把 move 预填进
 * 编辑器 atom。断言用捕获值与 atom 终态，不用调用类断言。
 */

let pathname = "/";
vi.mock("@tanstack/react-router", () => ({
	useLocation: (options?: { select?: (location: { pathname: string }) => unknown }) => {
		const location = { pathname };
		return options?.select ? options.select(location) : location;
	},
}));
vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

const WORK: Space = { id: "work", name: "工作", icon: { kind: "solar", value: "code" } };
const FUN: Space = { id: "fun", name: "兴趣", icon: { kind: "solar", value: "star" } };
const PROJECT_ITEM: SpaceItem = { kind: "project", key: "/repo/alpha" };

function renderMenu(item: SpaceItem | undefined, stateOverrides: Partial<typeof INITIAL_SPACES> = {}) {
	const store = createStore();
	store.set(spacesAtom, {
		...INITIAL_SPACES,
		spaces: [WORK, FUN],
		...stateOverrides,
	});
	const onClose = vi.fn();
	const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
		<Provider store={store}>{children}</Provider>
	);
	const rendered = renderHook(() => useMoveSpaceMenu(item, onClose), { wrapper });
	return { store, onClose, rendered };
}

describe("useMoveSpaceMenu", () => {
	beforeEach(() => {
		pathname = "/";
	});

	it("item 为空时不出菜单（不可移动的条目直接没有入口）", () => {
		const { rendered } = renderMenu(undefined);
		expect(rendered.result.current).toBeUndefined();
	});

	it("子菜单列出主空间与全部自定义空间，当前归属勾选，末尾是分割线与新工作空间", () => {
		const { rendered } = renderMenu(PROJECT_ITEM, { projects: { "/repo/alpha": "work" } });
		const node = rendered.result.current;
		expect(node).toMatchObject({ kind: "submenu", id: "move-space", label: "spaces.move" });
		if (node?.kind !== "submenu") throw new Error("unreachable");
		const spaceItems = node.items.filter((child) => child.kind === "item" && child.id !== "new-space");
		expect(spaceItems.map((child) => [child.id, "checked" in child ? Boolean(child.checked) : false])).toEqual([
			[MAIN_SPACE, false],
			["work", true],
			["fun", false],
		]);
		expect(node.items.filter((child) => child.kind === "separator")).toHaveLength(1);
		const tail = node.items[node.items.length - 1];
		expect(tail).toMatchObject({ kind: "item", id: "new-space", label: "spaces.new" });
	});

	it("选中目标空间后归属改写并关闭菜单", () => {
		const { store, onClose, rendered } = renderMenu(PROJECT_ITEM);
		const node = rendered.result.current;
		if (node?.kind !== "submenu") throw new Error("unreachable");
		const target = node.items.find((child) => child.kind === "item" && child.id === "fun");
		if (target?.kind !== "item") throw new Error("unreachable");

		act(() => target.onSelect());

		expect(store.get(spacesAtom).projects["/repo/alpha"]).toBe("fun");
		expect(onClose.mock.calls).toHaveLength(1);
	});

	it("正打开该条目的空间记住过位置时，移动后位置记忆跟随到目标空间", () => {
		// 用户正站在 /project/alpha 上，work 空间记着这个位置；移到 fun 后位置应跟过去，
		// 否则切到 fun 落进的是新会话页而不是用户正在看的项目。
		pathname = `/project/${encodeURIComponent("/repo/alpha")}`;
		const { store, rendered } = renderMenu(PROJECT_ITEM, {
			projects: { "/repo/alpha": "work" },
			locations: { work: { kind: "project", cwd: "/repo/alpha" } },
		});
		const node = rendered.result.current;
		if (node?.kind !== "submenu") throw new Error("unreachable");
		const target = node.items.find((child) => child.kind === "item" && child.id === "fun");
		if (target?.kind !== "item") throw new Error("unreachable");

		act(() => target.onSelect());

		const state = store.get(spacesAtom);
		expect(state.locations.fun).toEqual({ kind: "project", cwd: "/repo/alpha" });
		expect(state.locations.work).toBeUndefined();
	});

	it("「新工作空间」打开编辑器并预填 move，菜单先关闭", () => {
		const { store, onClose, rendered } = renderMenu(PROJECT_ITEM);
		const node = rendered.result.current;
		if (node?.kind !== "submenu") throw new Error("unreachable");
		const fresh = node.items.find((child) => child.kind === "item" && child.id === "new-space");
		if (fresh?.kind !== "item") throw new Error("unreachable");

		act(() => fresh.onSelect());

		expect(onClose.mock.calls).toHaveLength(1);
		expect(store.get(spaceEditorAtom)).toEqual({ move: PROJECT_ITEM });
	});

	it("默认区独立会话用会话路径作归属键移动", () => {
		const conversation: SpaceItem = { kind: "conversation", key: "/conv/s-1.jsonl" };
		const { store, rendered } = renderMenu(conversation);
		const node = rendered.result.current;
		if (node?.kind !== "submenu") throw new Error("unreachable");
		const target = node.items.find((child) => child.kind === "item" && child.id === "work");
		if (target?.kind !== "item") throw new Error("unreachable");

		act(() => target.onSelect());

		expect(store.get(spacesAtom).conversations["/conv/s-1.jsonl"]).toBe("work");
	});

});
