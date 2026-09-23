// @vitest-environment jsdom

import { todoItemsBySessionAtom } from "@shared/store/atoms";
import { createActivityWorkspace } from "@shared/workspace/activity-workspace";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityPanelContextProvider } from "../registry/context";
import { TodoTabPanel } from "./TodoTabPanel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

afterEach(cleanup);

function renderPanel(runtimeIds: readonly string[], labels?: Record<string, string>) {
	const store = createStore();
	render(
		<Provider store={store}>
			<ActivityPanelContextProvider
				value={{
					workspace: createActivityWorkspace("team-1", "/work/app", runtimeIds, labels),
					knowledgeHistory: false,
				}}
			>
				<TodoTabPanel />
			</ActivityPanelContextProvider>
		</Provider>,
	);
	return store;
}

describe("todo panel member attribution in aggregated team workspaces", () => {
	it("sections todos per labeled member when several members contributed rows", () => {
		const store = renderPanel(
			["runtime-lead", "runtime-builder"],
			{ "runtime-lead": "Lead", "runtime-builder": "Builder" },
		);
		act(() => {
			store.set(todoItemsBySessionAtom, new Map([
				["runtime-lead", [{ id: 1, content: "Review the release", status: "done" }]],
				["runtime-builder", [{ id: 2, content: "Ship the feature", status: "in_progress" }]],
			]));
		});

		// 两组各归各的成员：节头是成员名，行内容不再混排。
		expect(screen.getByText("Lead")).toBeTruthy();
		expect(screen.getByText("Builder")).toBeTruthy();
		expect(screen.getByText("Review the release")).toBeTruthy();
		expect(screen.getByText("Ship the feature")).toBeTruthy();
		expect(screen.queryByText("activityPanel.todo.headline")).toBeNull();
	});

	it("keeps the ordinary flat timeline for a single-runtime workspace", () => {
		const store = renderPanel(["runtime-1"], { "runtime-1": "Lead" });
		act(() => {
			store.set(todoItemsBySessionAtom, new Map([
				["runtime-1", [{ id: 1, content: "Only mine", status: "pending" }]],
			]));
		});

		expect(screen.getByText("activityPanel.todo.headline")).toBeTruthy();
		expect(screen.getByText("Only mine")).toBeTruthy();
		// 单 Runtime（普通对话或成员视图）不出现归属节头。
		expect(screen.queryByText("Lead")).toBeNull();
	});

	it("stays flat while only one of several runtimes has rows", () => {
		const store = renderPanel(
			["runtime-lead", "runtime-builder"],
			{ "runtime-lead": "Lead", "runtime-builder": "Builder" },
		);
		act(() => {
			store.set(todoItemsBySessionAtom, new Map([
				["runtime-lead", [{ id: 1, content: "Solo work", status: "pending" }]],
			]));
		});

		expect(screen.getByText("activityPanel.todo.headline")).toBeTruthy();
		expect(screen.queryByText("Builder")).toBeNull();
	});

	it("falls back to the unattributed heading for a labeled multi-runtime workspace with a stray runtime", () => {
		const store = renderPanel(
			["runtime-lead", "runtime-builder", "runtime-stray"],
			{ "runtime-lead": "Lead", "runtime-builder": "Builder" },
		);
		act(() => {
			store.set(todoItemsBySessionAtom, new Map([
				["runtime-lead", [{ id: 1, content: "Planned", status: "pending" }]],
				["runtime-builder", [{ id: 2, content: "Built", status: "done" }]],
				["runtime-stray", [{ id: 3, content: "Mystery row", status: "pending" }]],
			]));
		});

		expect(screen.getByText("activityPanel.todo.unattributed")).toBeTruthy();
		expect(screen.getByText("Mystery row")).toBeTruthy();
	});
});
