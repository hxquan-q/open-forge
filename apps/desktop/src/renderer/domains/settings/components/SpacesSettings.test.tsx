// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { defaultConversationCwdAtom } from "@shared/store/atoms";
import { INITIAL_SPACES, MAIN_SPACE, spaceEditorAtom, spacesAtom } from "@shared/store/spaces";
import project from "@/shared/i18n/locales/en/project.json";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createInstance } from "i18next";
import { createStore, Provider } from "jotai";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SpacesSettings } from "./SpacesSettings";

const i18n = createInstance();
await i18n.init({ lng: "en", fallbackLng: "en", resources: { en: { project } } });

function renderSettings(
	spaces: { id: string; name: string }[] = [],
	extra: Partial<typeof INITIAL_SPACES> = {},
	cwd = "/chat",
) {
	const store = createStore();
	store.set(spacesAtom, {
		...INITIAL_SPACES,
		spaces: spaces.map(({ id, name }) => ({ id, name, icon: { kind: "solar" as const, value: "folder" as const } })),
		...extra,
	});
	store.set(defaultConversationCwdAtom, cwd);
	render(
		<I18nextProvider i18n={i18n}>
			<Provider store={store}>
				<SpacesSettings />
			</Provider>
		</I18nextProvider>,
	);
	return store;
}

const ipc = vi.hoisted(() => ({
	configProjects: [] as { path: string }[],
	configArchived: [] as { path: string }[],
	listedSessions: [] as { path: string; name?: string; firstMessage?: string }[],
	running: [] as string[],
	sessionDelete: vi.fn(async (_path: string) => {}),
	projectRemove: vi.fn(async (_path: string) => {}),
}));

beforeEach(() => {
	ipc.configProjects = [];
	ipc.configArchived = [];
	ipc.listedSessions = [];
	ipc.running = [];
	ipc.sessionDelete.mockClear();
	ipc.projectRemove.mockClear();
	Object.defineProperty(window, "vetta", {
		configurable: true,
		value: {
			config: {
				get: vi.fn(async () => ({ projects: ipc.configProjects, archivedProjects: ipc.configArchived })),
				onProjectsChanged: () => () => undefined,
			},
			session: {
				listSessions: vi.fn(async () => ipc.listedSessions),
				listRunning: vi.fn(async () => ipc.running),
				delete: ipc.sessionDelete,
				onSessionsChanged: () => () => undefined,
			},
			project: {
				remove: ipc.projectRemove,
				readMeta: vi.fn(async () => null),
			},
			im: { onSessionChanged: () => () => undefined },
		},
	});
});

afterEach(() => {
	cleanup();
	localStorage.removeItem("vetta.desktop-spaces.v1");
});

function sessionFixture(path: string, extra: Partial<{ name: string; firstMessage: string }> = {}) {
	return {
		id: path,
		path,
		cwd: "/chat",
		firstMessage: "",
		modifiedAt: 1,
		access: { readHistory: true, resume: true, rename: true, delete: true },
		...extra,
	};
}

async function openRemovalDialog(name: string) {
	fireEvent.click(screen.getByRole("button", { name: `Remove ${name}` }));
	// 对话框挂载即开始盘点；盘点只影响破坏档的计数展示，两档 radio 立即可见。
	await waitFor(() => expect(screen.getByText(project.spaces.removeDescription)).toBeTruthy());
}

function chooseDestructiveTier() {
	fireEvent.click(screen.getByLabelText(project.spaces.removeWithProjects));
}

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

it("removes the workspace non-destructively, dropping memberships back to main", async () => {
	const sessionPath = "/test/chat/session.jsonl";
	const store = renderSettings([{ id: "work", name: "Work" }], {
		selected: "work",
		projects: { "/project": "work", "/other": MAIN_SPACE },
		conversations: { [sessionPath]: "work" },
	});
	await openRemovalDialog("Work");
	// 默认档与切片②a 行为一致：只摘归属，不删任何内容。
	expect(screen.getByLabelText(project.spaces.remove)).toBeTruthy();

	// 还没确认，空间原样在。
	expect(store.get(spacesAtom).spaces).toHaveLength(1);

	fireEvent.click(screen.getByRole("button", { name: project.spaces.remove }));
	await waitFor(() => expect(store.get(spacesAtom).spaces).toEqual([]));
	const state = store.get(spacesAtom);
	expect(state.selected).toBe(MAIN_SPACE);
	expect(state.projects).toEqual({});
	expect(state.conversations).toEqual({});
	expect(ipc.sessionDelete.mock.calls).toEqual([]);
	expect(ipc.projectRemove.mock.calls).toEqual([]);
});

it("keeps memberships of other spaces when one workspace is removed", async () => {
	const store = renderSettings(
		[
			{ id: "work", name: "Work" },
			{ id: "personal", name: "Personal" },
		],
		{
			projects: { "/project": "work", "/home": "personal" },
		},
	);
	await openRemovalDialog("Work");
	fireEvent.click(screen.getByRole("button", { name: project.spaces.remove }));
	await waitFor(() => expect(store.get(spacesAtom).spaces).toHaveLength(1));

	const state = store.get(spacesAtom);
	expect(state.spaces.map(({ id }) => id)).toEqual(["personal"]);
	expect(state.projects).toEqual({ "/home": "personal" });
});

it("does nothing when removal is cancelled through the dialog close", async () => {
	const store = renderSettings([{ id: "work", name: "Work" }]);
	await openRemovalDialog("Work");
	fireEvent.click(screen.getByRole("button", { name: project.spaces.cancel }));
	await waitFor(() => expect(screen.queryByText(project.spaces.removeDescription)).toBeNull());
	expect(store.get(spacesAtom).spaces).toHaveLength(1);
});

it("gates the destructive tier behind typing the workspace name", async () => {
	renderSettings([{ id: "work", name: "Work" }]);
	await openRemovalDialog("Work");
	chooseDestructiveTier();
	await waitFor(() => expect(screen.getByText(/Removes 0 projects/)).toBeTruthy());

	const confirm = screen.getByRole("button", { name: project.spaces.removeWithProjects }) as HTMLButtonElement;
	expect(confirm.disabled).toBe(true);
	fireEvent.change(screen.getByLabelText(/confirm/), { target: { value: "Wrok" } });
	expect(confirm.disabled).toBe(true);
	fireEvent.change(screen.getByLabelText(/confirm/), { target: { value: "Work" } });
	expect(confirm.disabled).toBe(false);
});

it("destructive removal deletes sessions first, then unregisters projects, then drops the workspace", async () => {
	const sessionA = sessionFixture("/s/a.jsonl", { name: "A" });
	const sessionB = sessionFixture("/s/b.jsonl", { name: "B" });
	ipc.configProjects = [{ path: "/proj-in" }, { path: "/proj-out" }];
	ipc.configArchived = [{ path: "/archived-in" }];
	ipc.listedSessions = [sessionA, sessionB];
	const store = renderSettings([{ id: "work", name: "Work" }], {
		projects: { "/proj-in": "work", "/archived-in": "work" },
		conversations: { "/s/a.jsonl": "work", "/s/b.jsonl": "work" },
	});
	await openRemovalDialog("Work");
	chooseDestructiveTier();
	// 影响计数按盘点如实展示：在册项目与独立会话计入删除，归档项目只并回主空间不删除。
	await waitFor(() => expect(screen.getByText(/Removes 1 projects/)).toBeTruthy());
	expect(screen.getByText(/deletes 2 standalone conversations/)).toBeTruthy();
	expect(screen.getByText(/1 archived projects move/)).toBeTruthy();
	fireEvent.change(screen.getByLabelText(/confirm/), { target: { value: "Work" } });

	fireEvent.click(screen.getByRole("button", { name: project.spaces.removeWithProjects }));
	await waitFor(() => expect(store.get(spacesAtom).spaces).toEqual([]));

	// 会话逐条删除走 BUG-0191 编排（session.delete），项目只注销登记、文件与项目内会话保留。
	expect(ipc.sessionDelete.mock.calls.map((call) => call[0])).toEqual(["/s/a.jsonl", "/s/b.jsonl"]);
	expect(ipc.projectRemove.mock.calls.map((call) => call[0])).toEqual(["/proj-in"]);
	// 编排顺序：全部会话删完才注销项目（归档项目不参与删除）。
	expect(Math.max(...ipc.sessionDelete.mock.invocationCallOrder)).toBeLessThan(
		Math.min(...ipc.projectRemove.mock.invocationCallOrder),
	);
});

it("refuses to delete anything while member sessions are still running and lists them", async () => {
	ipc.listedSessions = [
		sessionFixture("/s/a.jsonl", { name: "Alive" }),
		sessionFixture("/s/b.jsonl", { firstMessage: "Working on it" }),
	];
	ipc.running = ["/s/a.jsonl", "/s/b.jsonl"];
	const store = renderSettings([{ id: "work", name: "Work" }], {
		conversations: { "/s/a.jsonl": "work", "/s/b.jsonl": "work" },
	});
	await openRemovalDialog("Work");
	chooseDestructiveTier();
	fireEvent.change(screen.getByLabelText(/confirm/), { target: { value: "Work" } });

	fireEvent.click(screen.getByRole("button", { name: project.spaces.removeWithProjects }));
	await waitFor(() => expect(screen.getByText(project.spaces.running)).toBeTruthy());

	// 拦截是一个都不删：空间、内容原样保留，正在运行的名称按可展示文案列出。
	expect(screen.getByText("Alive")).toBeTruthy();
	expect(screen.getByText("Working on it")).toBeTruthy();
	expect(ipc.sessionDelete.mock.calls).toEqual([]);
	expect(ipc.projectRemove.mock.calls).toEqual([]);
	expect(store.get(spacesAtom).spaces).toHaveLength(1);
});

it("surfaces a retryable error when a deletion step fails and does not drop the workspace", async () => {
	ipc.listedSessions = [sessionFixture("/s/a.jsonl", { name: "A" })];
	ipc.sessionDelete.mockRejectedValueOnce(new Error("io failure"));
	const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
	const store = renderSettings([{ id: "work", name: "Work" }], {
		conversations: { "/s/a.jsonl": "work" },
	});
	await openRemovalDialog("Work");
	chooseDestructiveTier();
	fireEvent.change(screen.getByLabelText(/confirm/), { target: { value: "Work" } });

	fireEvent.click(screen.getByRole("button", { name: project.spaces.removeWithProjects }));
	await waitFor(() => expect(screen.getByText(project.spaces.error)).toBeTruthy());

	expect(store.get(spacesAtom).spaces).toHaveLength(1);
	consoleError.mockRestore();
});

it("recovers on retry after a failed destructive removal", async () => {
	ipc.listedSessions = [sessionFixture("/s/a.jsonl", { name: "A" })];
	ipc.sessionDelete.mockRejectedValueOnce(new Error("io failure"));
	const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
	const store = renderSettings([{ id: "work", name: "Work" }], {
		conversations: { "/s/a.jsonl": "work" },
	});
	await openRemovalDialog("Work");
	chooseDestructiveTier();
	fireEvent.change(screen.getByLabelText(/confirm/), { target: { value: "Work" } });

	// 第一次：删除失败，报错但一切保留，对话框不关闭。
	fireEvent.click(screen.getByRole("button", { name: project.spaces.removeWithProjects }));
	await waitFor(() => expect(screen.getByText(project.spaces.error)).toBeTruthy());
	expect(store.get(spacesAtom).spaces).toHaveLength(1);

	// 重试（第二次不再失败）：同一份输入直接提交，完成删除并关掉对话框。
	fireEvent.click(screen.getByRole("button", { name: project.spaces.removeWithProjects }));
	await waitFor(() => expect(store.get(spacesAtom).spaces).toEqual([]));
	expect(ipc.sessionDelete.mock.calls.map((call) => call[0])).toEqual(["/s/a.jsonl", "/s/a.jsonl"]);
	expect(screen.queryByText(project.spaces.error)).toBeNull();
	consoleError.mockRestore();
});
