// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import type { Project } from "@shared/store/atoms";
import { renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

/**
 * 远程项目行的主机标签：badge 位在普通类型项目上是空档，借它常驻显示所属主机名，
 * 让同名的远程目录在侧边栏里能分出归属。类型徽标（批量任务）优先；主机标签只在
 * ssh:// 项目上生效——调用方误传也不能贴到本地项目上。
 */

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key, i18n: { language: "zh" } }),
}));

const { useProjectGroupModel } = await import("./useProjectGroupModel.js");

function renderGroup(project: Project, remoteHostLabel?: string) {
	const store = createStore();
	return renderHook(
		() =>
			useProjectGroupModel({
				activeSessionPath: "",
				activeTeamSessionId: "",
				isExpanded: true,
				onCollapse: () => {},
				onExpand: () => {},
				onNavigateProject: () => {},
				onNewSession: () => {},
				onRenameSession: () => {},
				onSelectSession: () => {},
				project,
				remoteHostLabel,
				sessions: [],
			}),
		{
			wrapper: ({ children }: { children: ReactNode }): JSX.Element => (
				<Provider store={store}>{children}</Provider>
			),
		},
	);
}

const REMOTE: Project = { cwd: "ssh://h1/srv/app", name: "app", sessionCount: 0, type: "normal" };
const LOCAL: Project = { cwd: "C:/repo/app", name: "app", sessionCount: 0, type: "normal" };

describe("远程项目的主机标签", () => {
	it("ssh 项目在 badge 位显示所属主机名", () => {
		const { result } = renderGroup(REMOTE, "build-01");
		expect(result.current.projectBadge).toBe("build-01");
		expect(result.current.remote).toBe(true);
	});

	it("主机查不到时不显示标签，孤儿状态交给 OrphanRemoteProjectGuard", () => {
		const { result } = renderGroup(REMOTE, undefined);
		expect(result.current.projectBadge).toBeUndefined();
	});

	it("本地项目即使有传入值也不显示主机标签", () => {
		const { result } = renderGroup(LOCAL, "build-01");
		expect(result.current.projectBadge).toBeUndefined();
	});

	it("类型徽标优先：批量项目不被主机标签顶替", () => {
		const { result } = renderGroup({ ...REMOTE, type: "batch" }, "build-01");
		expect(result.current.projectBadge).toBe("detail.typeBatch");
	});
});
