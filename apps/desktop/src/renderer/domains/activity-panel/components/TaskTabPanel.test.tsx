// @vitest-environment jsdom

import { taskStateBySessionAtom } from "@shared/store/atoms";
import { createActivityWorkspace } from "@shared/workspace/activity-workspace";
import type { RuntimeTaskSnapshot } from "@vetta/runtime-core/task";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityPanelContextProvider } from "../registry/context";
import { TaskTabPanel } from "./TaskTabPanel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

function taskSnapshot(taskId: string, title: string): RuntimeTaskSnapshot {
	return {
		schemaVersion: 1,
		identity: { taskId, rootSessionId: "root" },
		status: "running",
		title,
		createdAt: 1,
		updatedAt: 1,
		artifactIds: [],
		pendingApprovalIds: [],
	};
}

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
				<TaskTabPanel />
			</ActivityPanelContextProvider>
		</Provider>,
	);
	return store;
}

afterEach(cleanup);

describe("task panel member attribution in aggregated team workspaces", () => {
	it("labels each task card with its owning member in a multi-runtime workspace", () => {
		const store = renderPanel(
			["runtime-lead", "runtime-builder"],
			{ "runtime-lead": "Lead", "runtime-builder": "Builder" },
		);
		act(() => {
			store.set(
				taskStateBySessionAtom,
				new Map([
					["runtime-lead", { tasks: [taskSnapshot("t-1", "Draft the plan")], artifacts: [], pendingApprovals: [], approvalDecisions: new Map() }],
					["runtime-builder", { tasks: [taskSnapshot("t-2", "Lay the bricks")], artifacts: [], pendingApprovals: [], approvalDecisions: new Map() }],
				]),
			);
		});

		expect(screen.getByText("Draft the plan")).toBeTruthy();
		expect(screen.getByText("Lay the bricks")).toBeTruthy();
		expect(screen.getByText("Lead")).toBeTruthy();
		expect(screen.getByText("Builder")).toBeTruthy();
	});

	it("keeps task cards unattributed in an ordinary single-runtime workspace", () => {
		const store = renderPanel(["runtime-1"], { "runtime-1": "Lead" });
		act(() => {
			store.set(
				taskStateBySessionAtom,
				new Map([
					["runtime-1", { tasks: [taskSnapshot("t-1", "Solo task")], artifacts: [], pendingApprovals: [], approvalDecisions: new Map() }],
				]),
			);
		});

		expect(screen.getByText("Solo task")).toBeTruthy();
		expect(screen.queryByText("Lead")).toBeNull();
	});
});
