// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import {
	type DefaultConversationFilter,
	defaultConversationFilterAtom,
	sidebarFilterAtom,
} from "@shared/store/atoms";
import { INITIAL_SPACES, MAIN_SPACE, type Space, spacesAtom } from "@shared/store/spaces";
import { act, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { JSX, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
	useDefaultConversationFilterSelectModel,
	useSidebarFilterSelectModel,
} from "./useSidebarFilterSelectModel";

/**
 * 非主空间的过滤器钳制（ADR-0156）：claw 会话不属于任何工作空间、批量项目只显示
 * 在主空间，所以「批量 / Claw」选项在非主空间隐藏，停在其上的档位自动回落。
 */

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

const WORK_SPACE: Space = { id: "work", name: "工作", icon: { kind: "solar", value: "code" } };

function renderFilters(selected: string) {
	const store = createStore();
	store.set(spacesAtom, {
		...INITIAL_SPACES,
		spaces: [WORK_SPACE],
		selected,
	});
	const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
		<Provider store={store}>{children}</Provider>
	);
	const sidebar = renderHook(() => useSidebarFilterSelectModel(), { wrapper });
	const conversation = renderHook(() => useDefaultConversationFilterSelectModel(), { wrapper });
	return { store, sidebar, conversation };
}

describe("非主空间的过滤器钳制", () => {
	it("自定义空间下侧栏过滤器隐藏「批量」、会话过滤器隐藏「Claw」", () => {
		const { sidebar, conversation } = renderFilters("work");
		expect(sidebar.result.current.options.map((option) => option.value)).toEqual(["all", "normal"]);
		expect(
			conversation.result.current.options
				.filter((option) => !option.value.startsWith("tag:"))
				.map((option) => option.value),
		).toEqual(["conversation"]);
	});

	it("停在「批量」档时切到自定义空间，显示值回落「全部」但不改写存储档位", () => {
		const { store, sidebar } = renderFilters("work");
		act(() => store.set(sidebarFilterAtom, "batch"));
		expect(sidebar.result.current.value).toBe("all");
		expect(store.get(sidebarFilterAtom)).toBe("batch");
	});

	it("停在 Claw 档时切到自定义空间，显示值回落「对话」但不改写存储档位", () => {
		const { store, conversation } = renderFilters("work");
		act(() => store.set(defaultConversationFilterAtom, "claw"));
		expect(conversation.result.current.value).toBe("conversation");
		expect(store.get(defaultConversationFilterAtom)).toBe("claw");
	});

	it("主空间下两个过滤器的选项与档位不受影响", () => {
		const { store, sidebar, conversation } = renderFilters(MAIN_SPACE);
		act(() => store.set(sidebarFilterAtom, "batch"));
		act(() => store.set(defaultConversationFilterAtom, "claw" as DefaultConversationFilter));
		expect(sidebar.result.current.options.map((option) => option.value)).toEqual(["all", "normal", "batch"]);
		expect(sidebar.result.current.value).toBe("batch");
		expect(
			conversation.result.current.options
				.filter((option) => !option.value.startsWith("tag:"))
				.map((option) => option.value),
		).toEqual(["conversation", "claw"]);
		expect(conversation.result.current.value).toBe("claw");
	});
});
