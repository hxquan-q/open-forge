// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { activityPanelOpenAtom, taskStateBySessionAtom } from "@shared/store/atoms";
import type { WorkspaceMode } from "@shared/store/atoms";
import type { ArtifactDescriptor, RuntimeSessionTaskState, RuntimeTaskSnapshot } from "@vetta/runtime-core/task";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTaskProjection } from "./useTaskProjection";
import { useWorkspaceRightPanel } from "./useWorkspaceRightPanel";

const getState = vi.fn();

vi.stubGlobal(
	"window",
	Object.assign(globalThis.window, {
		vetta: {
			task: {
				getState: (...args: unknown[]) => getState(...args),
			},
		},
	}),
);

function taskSnapshot(overrides: Partial<RuntimeTaskSnapshot> = {}): RuntimeTaskSnapshot {
	return {
		schemaVersion: 1,
		identity: { taskId: "task-1", rootSessionId: "runtime-1" },
		status: "running",
		title: "整理季度材料",
		createdAt: 100,
		updatedAt: 120,
		artifactIds: [],
		pendingApprovalIds: [],
		...overrides,
	};
}

function artifactDescriptor(overrides: Partial<ArtifactDescriptor> = {}): ArtifactDescriptor {
	return {
		schemaVersion: 1,
		artifactId: "artifact-1",
		kind: "document",
		status: "generated",
		title: "季度纪要.md",
		uri: "C:/session/artifacts/quarter.md",
		version: 1,
		sourceSessionId: "runtime-1",
		createdAt: 100,
		updatedAt: 120,
		...overrides,
	};
}

function taskState(overrides: Partial<RuntimeSessionTaskState> = {}): RuntimeSessionTaskState {
	return {
		tasks: [taskSnapshot()],
		artifacts: [artifactDescriptor()],
		pendingApprovals: [],
		approvalDecisions: new Map(),
		...overrides,
	};
}

interface PanelInput {
	readonly mode: WorkspaceMode | undefined;
	readonly runtimeIds: readonly string[];
	readonly hasExplicitActivity: boolean;
}

const workInput = (overrides: Partial<PanelInput> = {}): PanelInput => ({
	mode: "work",
	runtimeIds: ["runtime-1"],
	hasExplicitActivity: false,
	...overrides,
});

function renderPanel(input: PanelInput, setup?: (store: ReturnType<typeof createStore>) => void) {
	const store = createStore();
	setup?.(store);
	const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
	return renderHook(() => useWorkspaceRightPanel(input), { wrapper });
}

beforeEach(() => {
	getState.mockReset().mockResolvedValue(taskState({ tasks: [], artifacts: [] }));
});

afterEach(() => cleanup());

describe("useWorkspaceRightPanel", () => {
	it("work 会话没有任何任务/产物时右栏整条不占位", () => {
		const { result } = renderPanel(workInput());
		expect(result.current).toBe("none");
	});

	it("投影里已有任务时渲染 work 面板", () => {
		const { result } = renderPanel(workInput(), (store) =>
			store.set(taskStateBySessionAtom, new Map([["runtime-1", taskState()]])),
		);
		expect(result.current).toBe("work");
	});

	it("任务挂在会话的非首个 runtime 上也算有内容", () => {
		const { result } = renderPanel(workInput({ runtimeIds: ["runtime-1", "runtime-2"] }), (store) =>
			store.set(
				taskStateBySessionAtom,
				new Map([["runtime-2", taskState({ artifacts: [], tasks: [taskSnapshot()] })]]),
			),
		);
		expect(result.current).toBe("work");
	});

	it("重开会话时主进程快照补齐已有产物，右栏随投影出现", async () => {
		getState.mockResolvedValue(taskState({ tasks: [] }));
		const { result } = renderPanel(workInput());
		expect(result.current).toBe("none");
		await waitFor(() => expect(result.current).toBe("work"));
		expect(getState).toHaveBeenCalledWith("runtime-1");
	});

	it("快照拉取失败时保持空态，事件流仍可后续补齐", async () => {
		getState.mockRejectedValue(new Error("offline"));
		const { result } = renderPanel(workInput());
		await waitFor(() => expect(getState).toHaveBeenCalled());
		expect(result.current).toBe("none");
	});

	it("用户打开文件预览时右栏让位给活动面板", () => {
		const { result } = renderPanel(workInput(), (store) => {
			store.set(taskStateBySessionAtom, new Map([["runtime-1", taskState()]]));
			store.set(activityPanelOpenAtom, true);
		});
		expect(result.current).toBe("activity");
	});

	it("Team 等显式 activity 宿主优先于 work 面板", () => {
		const { result } = renderPanel(workInput({ hasExplicitActivity: true }), (store) =>
			store.set(taskStateBySessionAtom, new Map([["runtime-1", taskState()]])),
		);
		expect(result.current).toBe("activity");
	});

	it("非 work 模式不拉任务快照", () => {
		const { result } = renderPanel(workInput({ mode: "coding" }));
		expect(result.current).toBe("activity");
		expect(getState).not.toHaveBeenCalled();
	});

	it("门槛与面板同挂时同一 runtime 只拉一次快照", async () => {
		const store = createStore();
		const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
		renderHook(
			() => {
				useWorkspaceRightPanel(workInput());
				useTaskProjection(["runtime-1"]);
			},
			{ wrapper },
		);
		await waitFor(() => expect(getState).toHaveBeenCalled());
		expect(getState).toHaveBeenCalledTimes(1);
	});
});
