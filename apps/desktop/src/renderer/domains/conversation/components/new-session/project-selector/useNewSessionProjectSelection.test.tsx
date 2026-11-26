// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * 选择状态的接线：默认值跟随入口、用户选择只覆盖页面本地上下文、换入口后重新推导。
 */
import {
	defaultConversationCwdAtom,
	type Project,
	projectsAtom,
	readWorkspaceModeFor,
	type WorkspaceMode,
	workspaceModeByProjectAtom,
	writeWorkspaceMode,
} from "@shared/store/atoms";
import { INITIAL_SPACES, spacesAtom } from "@shared/store/spaces";
import { act, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { JSX, ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { useNewSessionProjectSelection } from "./useNewSessionProjectSelection";

const DEFAULT_CWD = "/home/u/conversation";

const PROJECTS = [
	{ cwd: DEFAULT_CWD, name: "对话", sessionCount: 0, type: "normal", isDefault: true },
	{ cwd: "/w/alpha", name: "Alpha", sessionCount: 0, type: "normal" },
	{ cwd: "/w/batch", name: "批量", sessionCount: 0, type: "batch" },
] as Project[];

function renderSelection(routeCwd: string) {
	const store = createStore();
	store.set(projectsAtom, PROJECTS);
	store.set(defaultConversationCwdAtom, DEFAULT_CWD);
	const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
		<Provider store={store}>{children}</Provider>
	);
	return {
		store,
		...renderHook(({ cwd }: { cwd: string }) => useNewSessionProjectSelection(cwd), {
			initialProps: { cwd: routeCwd },
			wrapper,
		}),
	};
}

describe("useNewSessionProjectSelection", () => {
	it("从默认「对话」进入：未选中，上下文仍是默认项目，活动面板没有可浏览目录", () => {
		const { result } = renderSelection(DEFAULT_CWD);
		expect(result.current.selection).toBeNull();
		expect(result.current.contextCwd).toBe(DEFAULT_CWD);
		expect(result.current.activityPanelCwd).toBeNull();
	});

	it("从项目进入：默认选中该项目，可选列表里没有默认「对话」与批量项目", () => {
		const { result } = renderSelection("/w/alpha");
		expect(result.current.selection).toEqual({ kind: "project", cwd: "/w/alpha", name: "Alpha" });
		expect(result.current.options).toEqual([{ cwd: "/w/alpha", name: "Alpha" }]);
		expect(result.current.activityPanelCwd).toBe("/w/alpha");
	});

	it("选「不指定项目」后上下文回到默认「对话」，路由不参与", () => {
		const { result } = renderSelection("/w/alpha");
		act(() => result.current.selectProject(null));
		expect(result.current.selection).toBeNull();
		expect(result.current.contextCwd).toBe(DEFAULT_CWD);
	});

	it("待创建项目不改上下文：目标目录此刻还不存在", () => {
		const { result } = renderSelection(DEFAULT_CWD);
		act(() => result.current.selectPendingProject("新项目"));
		expect(result.current.selection).toEqual({ kind: "pending-create", name: "新项目" });
		expect(result.current.contextCwd).toBe(DEFAULT_CWD);
		expect(result.current.activityPanelCwd).toBeNull();

		act(() => result.current.applyCreatedProject("/w/created", "新项目"));
		expect(result.current.contextCwd).toBe("/w/created");
	});

	it("待创建项目落盘时，用户选好的模式档位随迁到新项目键（BUG-0037）", () => {
		const { store, result } = renderSelection(DEFAULT_CWD);
		act(() => result.current.selectPendingProject("新项目"));
		// 待创建期间目录还不存在，版块入口把档位写在路由 cwd 键上（这里以非默认档 coding 为例：
		// 默认档 work 只删记录，迁移用例必须用会落盘的档位才有意义）。
		act(() =>
			store.set(
				workspaceModeByProjectAtom,
				writeWorkspaceMode(new Map<string, WorkspaceMode>(), DEFAULT_CWD, "coding"),
			),
		);

		act(() => result.current.applyCreatedProject("/w/created", "新项目"));

		// 会话派生按新项目 cwd 读：用户「看到并选择」的档位必须跟过去；路由 cwd 上的记录保留。
		expect(readWorkspaceModeFor(store.get(workspaceModeByProjectAtom), "/w/created")).toBe("coding");
		expect(readWorkspaceModeFor(store.get(workspaceModeByProjectAtom), DEFAULT_CWD)).toBe("coding");
	});

	it("换一个新会话入口后本地覆盖作废，重新按入口推导", () => {
		const { result, rerender } = renderSelection(DEFAULT_CWD);
		act(() => result.current.selectPendingProject("新项目"));
		expect(result.current.selection).toEqual({ kind: "pending-create", name: "新项目" });

		rerender({ cwd: "/w/alpha" });
		expect(result.current.selection).toEqual({ kind: "project", cwd: "/w/alpha", name: "Alpha" });
	});

	it("切换/打开本地项目时档位随迁：开发档新会话页换项目不静默回落默认档", () => {
		const { result, store } = renderSelection("/w/alpha");
		// 开发档进入：alpha 已是 coding（版块入口写入）。
		act(() =>
			store.set(
				workspaceModeByProjectAtom,
				writeWorkspaceMode(new Map<string, WorkspaceMode>(), "/w/alpha", "coding"),
			),
		);
		// 「打开本地项目」刚登记的新项目（选择列表随之出现）——切换过去带走 coding 档。
		act(() =>
			store.set(projectsAtom, [
				...PROJECTS,
				{ cwd: "/w/newly-opened", name: "刚打开", sessionCount: 0, type: "normal" } as Project,
			]),
		);
		act(() => result.current.selectProject("/w/newly-opened"));
		expect(readWorkspaceModeFor(store.get(workspaceModeByProjectAtom), "/w/newly-opened")).toBe("coding");
		expect(result.current.selection).toEqual({ kind: "project", cwd: "/w/newly-opened", name: "刚打开" });
	});

	it("takenNames 覆盖全部项目名，重名判断不漏掉默认与批量项目", () => {
		const { result } = renderSelection(DEFAULT_CWD);
		expect(result.current.takenNames).toEqual(["对话", "Alpha", "批量"]);
	});

	describe("工作空间过滤", () => {
		const WORK_SPACE = { id: "work", name: "工作", icon: { kind: "solar", value: "code" } } as const;

		function assignToWork(store: ReturnType<typeof createStore>) {
			store.set(spacesAtom, {
				...INITIAL_SPACES,
				spaces: [WORK_SPACE],
				selected: "work",
				projects: { "/w/alpha": "work" },
			});
		}

		it("自定义空间下可选列表只含该空间归属的项目，默认「对话」豁免可用", () => {
			const { store, result } = renderSelection(DEFAULT_CWD);
			act(() => assignToWork(store));
			// alpha 归属 work 可见；主空间的项目此时不在列表里。
			expect(result.current.options).toEqual([{ cwd: "/w/alpha", name: "Alpha" }]);

			act(() =>
				store.set(projectsAtom, [
					...PROJECTS,
					{ cwd: "/w/main-only", name: "主空间项目", sessionCount: 0, type: "normal" } as Project,
				]),
			);
			expect(result.current.options).toEqual([{ cwd: "/w/alpha", name: "Alpha" }]);
		});

		it("工作空间过滤不影响判重：takenNames 始终覆盖全部项目", () => {
			const { store, result } = renderSelection(DEFAULT_CWD);
			act(() => assignToWork(store));
			act(() =>
				store.set(projectsAtom, [
					...PROJECTS,
					{ cwd: "/w/main-only", name: "主空间项目", sessionCount: 0, type: "normal" } as Project,
				]),
			);
			expect(result.current.takenNames).toEqual(["对话", "Alpha", "批量", "主空间项目"]);
		});

		it("切换工作空间后本地覆盖作废，重新按入口推导", () => {
			const { store, result } = renderSelection("/w/alpha");
			act(() => assignToWork(store));
			expect(result.current.selection).toEqual({ kind: "project", cwd: "/w/alpha", name: "Alpha" });

			act(() => result.current.selectProject(null));
			expect(result.current.selection).toBeNull();

			// 切回主空间：alpha 不属于主空间，覆盖作废后按入口推导——
			// 入口项目不在本空间，用户不应被静默塞进一个看不见的项目。
			act(() =>
				store.set(spacesAtom, { ...store.get(spacesAtom), selected: "main" }),
			);
			// 注：入口推导基于路由 cwd 本身，空间过滤只收窄可选列表；alpha 不在主空间的
			// 过滤结果里，名字查不到注册名，回落 basename——这正是「覆盖已作废」的可观察证据。
			expect(result.current.selection).toEqual({ kind: "project", cwd: "/w/alpha", name: "alpha" });
		});

		it("同一空间内不切换时覆盖保持有效（scope 未变）", () => {
			const { store, result } = renderSelection("/w/alpha");
			act(() => assignToWork(store));
			act(() => result.current.selectProject(null));
			expect(result.current.selection).toBeNull();
			// 归属记录变动（例如别处移动了项目）不重置用户的选择。
			act(() =>
				store.set(spacesAtom, {
					...store.get(spacesAtom),
					projects: { "/w/alpha": "work", "/w/else": "work" },
				}),
			);
			expect(result.current.selection).toBeNull();
		});
	});
});
