// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { INITIAL_SPACES, MAIN_SPACE, spaceEditorAtom, spacesAtom } from "@shared/store/spaces";
import { confirmDialogAtom } from "@shared/store/atoms";
import project from "@/shared/i18n/locales/en/project.json";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import { createStore, Provider } from "jotai";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, it } from "vitest";
import { SpacesSettings } from "./SpacesSettings";

const i18n = createInstance();
await i18n.init({ lng: "en", fallbackLng: "en", resources: { en: { project } } });

function renderSettings(
	spaces: { id: string; name: string }[] = [],
	extra: Partial<typeof INITIAL_SPACES> = {},
) {
	const store = createStore();
	store.set(spacesAtom, {
		...INITIAL_SPACES,
		spaces: spaces.map(({ id, name }) => ({ id, name, icon: { kind: "solar" as const, value: "folder" as const } })),
		...extra,
	});
	render(
		<I18nextProvider i18n={i18n}>
			<Provider store={store}>
				<SpacesSettings />
			</Provider>
		</I18nextProvider>,
	);
	return store;
}

afterEach(() => {
	cleanup();
	localStorage.removeItem("vetta.desktop-spaces.v1");
});

it("explains workspaces above the list and shows the main workspace without row actions", () => {
	renderSettings([{ id: "work", name: "Work" }]);
	expect(screen.getByText(project.spaces.intro.subtitle)).toBeTruthy();
	for (const key of ["group", "switch", "resume", "safe"] as const) {
		expect(screen.getByText(project.spaces.intro[key].title)).toBeTruthy();
		expect(screen.getByText(project.spaces.intro[key].description)).toBeTruthy();
	}
	// 主空间固定存在：只有名称与图标，没有移动、编辑和移除动作。
	expect(screen.getByText("Main workspace")).toBeTruthy();
	expect(screen.queryByRole("button", { name: /Remove Main/ })).toBeNull();
	expect(screen.queryByRole("button", { name: /Edit Main/ })).toBeNull();
	expect(screen.getByRole("button", { name: "Remove Work" })).toBeTruthy();
	expect(screen.getByRole("button", { name: "Edit Work" })).toBeTruthy();
});

it("creates and edits workspaces through the shared space editor atom", () => {
	const store = renderSettings([{ id: "work", name: "Work" }]);
	fireEvent.click(screen.getByRole("button", { name: "New workspace" }));
	expect(store.get(spaceEditorAtom)).toEqual({});
	store.set(spaceEditorAtom, null);

	fireEvent.click(screen.getByRole("button", { name: "Edit Work" }));
	expect(store.get(spaceEditorAtom)).toEqual({ space: { id: "work", name: "Work", icon: { kind: "solar", value: "folder" } } });
});

it("reorders rows by dragging, matching the order the switcher reads", () => {
	const store = renderSettings([
		{ id: "work", name: "Work" },
		{ id: "personal", name: "Personal" },
	]);
	const work = screen.getByText("Work").closest<HTMLElement>("[draggable]");
	const personal = screen.getByText("Personal").closest<HTMLElement>("[draggable]");
	expect(work?.querySelector('[class*="grip-vertical"]')).not.toBeNull();
	// 主空间行不参与拖排。
	expect(screen.getByText("Main workspace").closest<HTMLElement>("[draggable]")).toBeNull();

	const data = new Map<string, string>();
	const dataTransfer = {
		setData: (key: string, value: string) => data.set(key, value),
		getData: (key: string) => data.get(key) ?? "",
	} as unknown as DataTransfer;
	if (work) fireEvent.dragStart(work, { dataTransfer });
	if (personal) fireEvent.drop(personal, { dataTransfer });
	expect(store.get(spacesAtom).spaces.map(({ id }) => id)).toEqual(["personal", "work"]);
});

it("asks before removing, then drops the workspace and its memberships back to main", () => {
	const sessionPath = "/test/chat/session.jsonl";
	const store = renderSettings([{ id: "work", name: "Work" }], {
		selected: "work",
		projects: { "/project": "work", "/other": MAIN_SPACE },
		conversations: { [sessionPath]: "work" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Remove Work" }));

	const confirmation = store.get(confirmDialogAtom);
	expect(confirmation?.title).toBe("Remove Work?");
	expect(confirmation?.message).toBe(project.spaces.removeDescription);
	expect(confirmation?.confirmLabel).toBe("Remove workspace");
	// 还没确认，空间原样在。
	expect(store.get(spacesAtom).spaces).toHaveLength(1);

	confirmation?.onConfirm(false);
	const state = store.get(spacesAtom);
	expect(state.spaces).toEqual([]);
	expect(state.selected).toBe(MAIN_SPACE);
	expect(state.projects).toEqual({});
	expect(state.conversations).toEqual({});
});

it("keeps memberships of other spaces when one workspace is removed", () => {
	const store = renderSettings(
		[
			{ id: "work", name: "Work" },
			{ id: "personal", name: "Personal" },
		],
		{
			projects: { "/project": "work", "/home": "personal" },
		},
	);
	fireEvent.click(screen.getByRole("button", { name: "Remove Work" }));
	store.get(confirmDialogAtom)?.onConfirm(false);

	const state = store.get(spacesAtom);
	expect(state.spaces.map(({ id }) => id)).toEqual(["personal"]);
	expect(state.projects).toEqual({ "/home": "personal" });
});

it("does nothing when removal is cancelled through the dialog close", () => {
	const store = renderSettings([{ id: "work", name: "Work" }]);
	fireEvent.click(screen.getByRole("button", { name: "Remove Work" }));
	// 取消走 onCancel/直接关掉对话框：不动空间，只清确认框。
	store.set(confirmDialogAtom, null);
	expect(store.get(spacesAtom).spaces).toHaveLength(1);
});