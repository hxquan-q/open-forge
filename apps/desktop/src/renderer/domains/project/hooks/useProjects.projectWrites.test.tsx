// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { INITIAL_SPACES, MAIN_SPACE, spacesAtom } from "@shared/store/spaces";
import { act, renderHook, waitFor } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectActions } from "./useProjects";

/**
 * 项目列表只有一条写路径：主进程的 ProjectService。
 *
 * 渲染进程以前是自己 `config.get()` → 改数组 → `config.set()`，与插件/Action 走的服务
 * 并行。那条路绕开了「必须是绝对路径」「必须是目录」的校验，也不发变更广播，于是同一
 * 个项目从侧边栏加和从插件加会得到不同结果，别的窗口还看不见。这里锁住重构后的不变量：
 * 侧边栏的增删改归档一律经过 `window.vetta.project.*`，且一次都不碰 `config.set`。
 */

const configSet = vi.fn(async () => {});
const configGet = vi.fn(async () => ({ projects: [] as never[], archivedProjects: [] as never[], defaultConversationCwd: "" }));
const project = {
	readMeta: vi.fn(async () => null),
	create: vi.fn(async ({ name }: { name: string }) => ({ path: `/workspace/${name}`, name })),
	open: vi.fn(async () => ({ path: "/picked/repo", name: "repo" })),
	archive: vi.fn(async () => {}),
	unarchive: vi.fn(async () => {}),
	remove: vi.fn(async () => {}),
	deleteCodeWorkspace: vi.fn(async () => {}),
};
const selectFolder = vi.fn(async () => "/picked/repo");
const fsDelete = vi.fn(async () => {});
const deleteAllForCwd = vi.fn(async () => {});

vi.stubGlobal(
	"window",
	Object.assign(globalThis.window, {
		vetta: {
			config: {
				get: configGet,
				set: configSet,
				onProjectsChanged: () => () => {},
			},
			project,
			dialog: { selectFolder },
			fs: { delete: fsDelete },
			session: {
				listSessions: async () => [],
				onSessionsChanged: () => () => {},
				deleteAllForCwd,
			},
			im: { onSessionChanged: () => () => {} },
		},
	}),
);

describe("侧边栏的项目写入", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		configGet.mockResolvedValue({ projects: [] as never[], archivedProjects: [] as never[], defaultConversationCwd: "" });
		getDefaultStore().set(spacesAtom, INITIAL_SPACES);
	});

	it("新建、打开、归档、取消归档、移除都走 ProjectService，且从不直写配置", async () => {
		const { result } = renderHook(() => useProjectActions());

		await act(async () => {
			await expect(result.current.createProject("demo")).resolves.toBe("/workspace/demo");
		});
		expect(project.create).toHaveBeenCalledWith({ name: "demo" });

		await act(async () => {
			await expect(result.current.openProject()).resolves.toBe("/picked/repo");
		});
		expect(selectFolder).toHaveBeenCalledOnce();
		expect(project.open).toHaveBeenCalledWith({ path: "/picked/repo" });

		await act(async () => {
			await result.current.archiveProject("/picked/repo");
			await result.current.unarchiveProject("/picked/repo");
			await result.current.removeProject("/picked/repo");
		});
		expect(project.archive).toHaveBeenCalledWith("/picked/repo");
		expect(project.unarchive).toHaveBeenCalledWith("/picked/repo");
		expect(project.remove).toHaveBeenCalledWith("/picked/repo");

		await waitFor(() => expect(configSet).not.toHaveBeenCalled());
	});

	it("登记远程项目时把备注名交给 ProjectService，空备注退回目录名兜底", async () => {
		const { result } = renderHook(() => useProjectActions());

		await act(async () => {
			await result.current.openProjectPath("ssh://host-1/home/dev", { name: " 构建机项目 " });
		});
		expect(project.open).toHaveBeenCalledWith({ path: "ssh://host-1/home/dev", name: "构建机项目" });

		await act(async () => {
			await result.current.openProjectPath("ssh://host-1/home/dev", { name: "   " });
		});
		expect(project.open).toHaveBeenLastCalledWith({ path: "ssh://host-1/home/dev", name: undefined });
	});

	it("取消选择目录时不登记任何项目", async () => {
		selectFolder.mockResolvedValueOnce("");
		const { result } = renderHook(() => useProjectActions());

		await act(async () => {
			await expect(result.current.openProject()).resolves.toBeNull();
		});

		expect(project.open).not.toHaveBeenCalled();
		expect(configSet).not.toHaveBeenCalled();
	});

	it("删除项目目录时，先清会话再摘登记，然后删目录，最后清理 AI 工作区", async () => {
		const { result } = renderHook(() => useProjectActions());
		const order: string[] = [];
		deleteAllForCwd.mockImplementationOnce(async () => {
			order.push("sessions");
		});
		project.remove.mockImplementationOnce(async () => {
			order.push("unregister");
		});
		fsDelete.mockImplementationOnce(async () => {
			order.push("disk");
		});
		project.deleteCodeWorkspace.mockImplementationOnce(async () => {
			order.push("workspace");
		});

		await act(async () => {
			await result.current.deleteProjectFromDisk("/picked/repo");
		});

		// 会话分片目录由 config.projects 推导，摘登记之后就找不到了，顺序不能反；
		// AI 工作区是硬删除语义的一部分（REQ-0031），在项目目录之后清理。
		expect(order).toEqual(["sessions", "unregister", "disk", "workspace"]);
		expect(project.deleteCodeWorkspace).toHaveBeenCalledWith("/picked/repo");
		expect(configSet).not.toHaveBeenCalled();
	});

	describe("工作空间归属写入", () => {
		const WORK_SPACE = { id: "work", name: "工作", icon: { kind: "solar", value: "code" } } as const;

		function selectSpace(id: string) {
			getDefaultStore().set(spacesAtom, {
				...INITIAL_SPACES,
				spaces: [WORK_SPACE],
				selected: id,
			});
		}

		it("在自定义空间新建项目：新项目归属当前空间", async () => {
			selectSpace("work");
			const { result } = renderHook(() => useProjectActions());

			await act(async () => {
				await result.current.createProject("demo");
			});

			expect(getDefaultStore().get(spacesAtom).projects["/workspace/demo"]).toBe("work");
		});

		it("打开目录登记新项目：归属进入对话框那一刻的空间，期间切走不影响", async () => {
			selectSpace("work");
			selectFolder.mockImplementationOnce(async () => {
				// 对话框挡住的这段时间用户切回了主空间——归属仍以点击时为准。
				selectSpace(MAIN_SPACE);
				return "/picked/repo";
			});
			const { result } = renderHook(() => useProjectActions());

			await act(async () => {
				await result.current.openProject();
			});

			expect(getDefaultStore().get(spacesAtom).projects["/picked/repo"]).toBe("work");
		});

		it("reopen 已登记的项目：不改写归属，直接跳回它既有归属的空间", async () => {
			// 项目已在配置里且归属 work；这次在主空间重新打开它，结果应是跳回 work，
			// 归属记录保持原样（openProjectPath 读的是 IPC 解析后的 entry.path）。
			getDefaultStore().set(spacesAtom, {
				...INITIAL_SPACES,
				spaces: [WORK_SPACE],
				selected: MAIN_SPACE,
				projects: { "/picked/repo": "work" },
			});
			configGet.mockResolvedValue({
				projects: [{ path: "/picked/repo", name: "repo" }] as never[],
				archivedProjects: [] as never[],
				defaultConversationCwd: "",
			});
			const { result } = renderHook(() => useProjectActions());

			await act(async () => {
				await result.current.openProjectPath("/picked/repo");
			});

			const state = getDefaultStore().get(spacesAtom);
			expect(state.selected).toBe("work");
			expect(state.projects["/picked/repo"]).toBe("work");
		});

		it("reopen 仅在归档列表里的项目：同样按已存在处理，跳回既有归属", async () => {
			// existing 判定合并 projects 与 archivedProjects——漏掉归档分支会把
			// 已归档项目当成新登记，重写成当前空间归属。
			getDefaultStore().set(spacesAtom, {
				...INITIAL_SPACES,
				spaces: [WORK_SPACE],
				selected: MAIN_SPACE,
				projects: { "/picked/repo": "work" },
			});
			configGet.mockResolvedValue({
				projects: [] as never[],
				archivedProjects: [{ path: "/picked/repo", name: "repo" }] as never[],
				defaultConversationCwd: "",
			});
			const { result } = renderHook(() => useProjectActions());

			await act(async () => {
				await result.current.openProjectPath("/picked/repo");
			});

			const state = getDefaultStore().get(spacesAtom);
			expect(state.selected).toBe("work");
			expect(state.projects["/picked/repo"]).toBe("work");
		});

		it("openProjectPath 显式传入 spaceId 时优先于当前选中空间", async () => {
			selectSpace(MAIN_SPACE);
			const { result } = renderHook(() => useProjectActions());

			await act(async () => {
				await result.current.openProjectPath("/picked/repo", { spaceId: "work" });
			});

			expect(getDefaultStore().get(spacesAtom).projects["/picked/repo"]).toBe("work");
		});
	});
});
