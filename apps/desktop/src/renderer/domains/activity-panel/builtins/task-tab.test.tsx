// @vitest-environment jsdom
import { taskStateBySessionAtom } from "@shared/store/atoms";
import { cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeSessionTaskState, RuntimeTaskSnapshot } from "@vetta/runtime-core/task";
import { ActivityPanelContextProvider } from "../registry/context";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const runCommand = vi.fn();
const getState = vi.fn();
const getArtifactViews = vi.fn();

vi.stubGlobal(
	"window",
	Object.assign(globalThis.window, {
		vetta: {
			task: {
				runCommand: (...args: unknown[]) => runCommand(...args),
				getState: (...args: unknown[]) => getState(...args),
				getArtifactViews: (...args: unknown[]) => getArtifactViews(...args),
			},
		},
	}),
);

const { taskTabDefinition } = await import("./task-tab.js");
const store = getDefaultStore();

function taskSnapshot(overrides: Partial<RuntimeTaskSnapshot> = {}): RuntimeTaskSnapshot {
	return {
		schemaVersion: 1,
		identity: { taskId: "task-1", rootSessionId: "runtime-1", generation: "generation-1" },
		status: "running",
		title: "整理季度材料",
		createdAt: 100,
		updatedAt: 120,
		artifactIds: [],
		pendingApprovalIds: [],
		...overrides,
	};
}

function setState(state: RuntimeSessionTaskState): void {
	store.set(taskStateBySessionAtom, new Map([["runtime-1", state]]));
}

function wrapperFor(runtimeIds: readonly string[]) {
	return ({ children }: { children: ReactNode }) => (
		<ActivityPanelContextProvider
			value={{ workspace: { id: "workspace", cwd: null, runtimeIds: [...runtimeIds] }, knowledgeHistory: false }}
		>
			{children}
		</ActivityPanelContextProvider>
	);
}

describe("activity panel task tab", () => {
	afterEach(() => {
		cleanup();
		store.set(taskStateBySessionAtom, new Map());
		runCommand.mockReset();
		getState.mockReset().mockResolvedValue({ tasks: [], artifacts: [], pendingApprovals: [], approvalDecisions: new Map() });
		getArtifactViews.mockReset().mockResolvedValue([]);
	});

	it("没有任务时不占 tab；出现任务后 tab 带活跃徽标", () => {
		const wrapper = wrapperFor(["runtime-1"]);
		const meta = renderHook(() => taskTabDefinition.useMeta(), { wrapper });
		expect(meta.result.current).toBeNull();

		setState({ tasks: [taskSnapshot()], artifacts: [], pendingApprovals: [], approvalDecisions: new Map() });
		meta.rerender();
		expect(meta.result.current).toMatchObject({ label: "activityPanel.tabs.task", badge: 1 });
	});

	it("空态提供「升级为任务」入口并发起 create 命令", () => {
		const Tab = taskTabDefinition.component;
		render(<Tab />, { wrapper: wrapperFor(["runtime-1"]) });
		const create = screen.getByRole("button", { name: "activityPanel.task.create" });
		fireEvent.click(create);
		expect(runCommand).toHaveBeenCalledWith("runtime-1", { type: "create" });
	});

	it("等待审阅的任务展示三条裁决路径并发起 review 命令", () => {
		setState({ tasks: [taskSnapshot({ status: "awaiting_review" })], artifacts: [], pendingApprovals: [], approvalDecisions: new Map() });
		const Tab = taskTabDefinition.component;
		render(<Tab />, { wrapper: wrapperFor(["runtime-1"]) });
		expect(screen.getByRole("heading", { name: "activityPanel.task.headline" })).toBeTruthy();
		expect(screen.getByText("activityPanel.task.status.awaitingReview")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "activityPanel.task.action.requestChanges" }));
		expect(runCommand).toHaveBeenCalledWith("runtime-1", {
			type: "review",
			taskId: "task-1",
			decision: "changes_requested",
		});
		fireEvent.click(screen.getByRole("button", { name: "activityPanel.task.action.approve" }));
		expect(runCommand).toHaveBeenCalledWith("runtime-1", { type: "review", taskId: "task-1", decision: "approved" });
	});

	it("不显示其他会话的任务", () => {
		setState({ tasks: [taskSnapshot()], artifacts: [], pendingApprovals: [], approvalDecisions: new Map() });
		const meta = renderHook(() => taskTabDefinition.useMeta(), { wrapper: wrapperFor(["other-runtime"]) });
		expect(meta.result.current).toBeNull();
	});
});
