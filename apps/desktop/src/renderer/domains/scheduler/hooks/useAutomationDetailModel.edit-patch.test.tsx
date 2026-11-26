// Copyright The Open Forge contributors.
// @vitest-environment jsdom

/**
 * 编辑保存补丁的「未变不下发」合同（ADR-0155 §2 防护）：
 * patch.runTarget 存在即清 suspendedReason、patch.enabled===true 也清——
 * 所以只改标题/提示词的保存绝不能带上未变的 enabled/runTarget，
 * executionMode/permissionTiers 同理（固化继承语义）。补丁内容用捕获值
 * 直接比较，不做调用类断言。
 */

import type { DesktopApi } from "@preload/api";
import type { ScheduledTask } from "@shared/store/atoms";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SchedulerTaskDraft } from "../components/SchedulerTaskFields";
import { useAutomationDetailModel } from "./useAutomationDetailModel";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}));

function wrapperFor(store: ReturnType<typeof createStore>) {
	return function Wrapper({ children }: { children: ReactNode }) {
		return <Provider store={store}>{children}</Provider>;
	};
}

function task(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
	return {
		id: "task-1",
		name: "Daily report",
		prompt: "Summarize today",
		schedule: { kind: "daily", hour: 9, minute: 0 },
		runTarget: { mode: "new-session", projectCwd: "C:/workspace/project" },
		enabled: true,
		createdAt: 1,
		updatedAt: 1,
		lastRunAt: null,
		lastRunStatus: null,
		...overrides,
	};
}

describe("useAutomationDetailModel 编辑保存补丁", () => {
	let scheduler: DesktopApi["scheduler"];
	let patches: Array<Record<string, unknown>>;

	beforeEach(() => {
		patches = [];
		scheduler = {
			getTasks: vi.fn(async () => []),
			createTask: vi.fn(),
			updateTask: vi.fn(async (_id: string, patch: Record<string, unknown>) => {
				patches.push(patch);
			}),
			deleteTask: vi.fn(async () => undefined),
			toggleTask: vi.fn(async () => undefined),
			disableTask: vi.fn(async () => undefined),
			getRecords: vi.fn(async () => []),
			getRunningTaskIds: vi.fn(async () => []),
			getScheduledSessionPaths: vi.fn(async () => []),
			deleteRecordsBySession: vi.fn(async () => []),
			runTaskNow: vi.fn(async () => undefined),
			abortTask: vi.fn(async () => undefined),
			onTaskEvent: vi.fn(() => () => {}),
			exportAutomationPackages: vi.fn(async () => ({ status: "canceled" as const })),
			importAutomationPackage: vi.fn(async () => ({ status: "canceled" as const })),
			importAutomationPackageFromUrl: vi.fn(async () => ({ status: "canceled" as const })),
			previewAutomationPackage: vi.fn(),
			discoverAutomationPackages: vi.fn(async () => []),
			emitAutomationHostEvent: vi.fn(async () => undefined),
		} as unknown as DesktopApi["scheduler"];
		Object.defineProperty(window, "vetta", {
			configurable: true,
			value: { scheduler } as unknown as DesktopApi,
		});
	});

	function renderDetail(target: ScheduledTask) {
		const store = createStore();
		return renderHook(() => useAutomationDetailModel({ task: target, onClose: () => {} }), {
			wrapper: wrapperFor(store),
		});
	}

	async function submitAfterNameEdit(result: { current: ReturnType<typeof useAutomationDetailModel> }) {
		act(() => {
			result.current.onChange({ ...result.current.draft, name: "Renamed" });
		});
		act(() => result.current.onSubmit());
		await waitFor(() => expect(patches.length).toBe(1));
		return patches[0];
	}

	it("只改标题时不带 enabled / runTarget / executionMode / permissionTiers", async () => {
		const { result } = renderDetail(
			task({
				enabled: false,
				suspendedReason: "session-deleted",
				permissionTiers: { allowWorkspaceWrite: true },
			}),
		);

		const patch = await submitAfterNameEdit(result);

		expect(patch.name).toBe("Renamed");
		expect(patch).not.toHaveProperty("enabled");
		expect(patch).not.toHaveProperty("runTarget");
		expect(patch).not.toHaveProperty("executionMode");
		expect(patch).not.toHaveProperty("permissionTiers");
	});

	it("显式打开开关时才带 enabled:true（用于恢复暂停）", async () => {
		const { result } = renderDetail(task({ enabled: false, suspendedReason: "session-deleted" }));

		act(() => {
			result.current.onChange({ ...result.current.draft, enabled: true } as SchedulerTaskDraft);
		});
		act(() => result.current.onSubmit());
		await waitFor(() => expect(patches.length).toBe(1));

		expect(patches[0].enabled).toBe(true);
	});

	it("权限分层用户未改动时即使表单取值为空也不改写服务端", async () => {
		const { result } = renderDetail(task({ permissionTiers: { allowWorkspaceWrite: true } }));

		const patch = await submitAfterNameEdit(result);

		expect(patch).not.toHaveProperty("permissionTiers");
	});

	it("权限分层全部关闭时下发空对象（服务端归一为空即清除）", async () => {
		const { result } = renderDetail(task({ permissionTiers: { allowWorkspaceWrite: true } }));

		act(() => {
			result.current.onChange({
				...result.current.draft,
				permissionTiers: { allowWorkspaceWrite: false },
			} as SchedulerTaskDraft);
		});
		act(() => result.current.onSubmit());
		await waitFor(() => expect(patches.length).toBe(1));

		expect(patches[0].permissionTiers).toEqual({});
	});

	it("改动 executionMode 时下发新值", async () => {
		const { result } = renderDetail(task());

		act(() => {
			result.current.onChange({ ...result.current.draft, executionMode: "sandbox" } as SchedulerTaskDraft);
		});
		act(() => result.current.onSubmit());
		await waitFor(() => expect(patches.length).toBe(1));

		expect(patches[0].executionMode).toBe("sandbox");
	});

	it("改动 cwd 时下发 runTarget（此时清暂停是用户意图的一部分）", async () => {
		const { result } = renderDetail(task({ enabled: false, suspendedReason: "project-removed" }));

		act(() => {
			result.current.onChange({ ...result.current.draft, cwd: "C:/workspace/other" } as SchedulerTaskDraft);
		});
		act(() => result.current.onSubmit());
		await waitFor(() => expect(patches.length).toBe(1));

		expect(patches[0].runTarget).toEqual({ mode: "new-session", projectCwd: "C:/workspace/other" });
	});
});

