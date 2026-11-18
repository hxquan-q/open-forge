// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * 版块首页 View 的渲染合同：loading / 卡片网格（会话打开、每卡新建、还有 N 条）/ 空态
 * 引导。View 只消费 view model——用 fixture 直接驱动，不挂真实 model。
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AllstarDevHomePageModel } from "../hooks/useAllstarDevHomePageModel";
import { AllstarDevHomePageView } from "./AllstarDevHomePageView";

const LABELS: AllstarDevHomePageModel["labels"] = {
	intro: "intro",
	loading: "loading",
	projectsTitle: "dev projects",
	newSession: "new dev session",
	moreSessions: (count: number) => `${count} more`,
	teamSession: "team session",
	emptyTitle: "no sessions",
	emptyHint: "pick a project above",
	emptyCardHint: "no dev sessions on this card",
	emptyProjectLabel: "pick project",
	openProject: "open project",
	configureProject: "project config",
	projectConfigTitle: "project configuration",
	projectConfigDescription: "project config description",
	projectConfigFieldLabel: "configuration notes",
	projectConfigTemplate: "template",
	projectConfigPrivacyWarning: "do not store secrets",
	projectConfigLoading: "loading config",
	projectConfigLoadFailed: "load failed",
	projectConfigSave: "save config",
	projectConfigSaving: "saving config",
	projectConfigSaved: "config saved",
	projectConfigSaveFailed: "save failed",
	projectConfigCancel: "cancel config",
};

function model(overrides: Partial<AllstarDevHomePageModel> = {}): AllstarDevHomePageModel {
	return {
		loading: false,
		labels: LABELS,
		projectCards: [],
		projects: [{ cwd: "/proj/a", name: "a" }],
		selectedCwd: "/proj/a",
		onSelectProject: vi.fn(),
		onOpenSession: vi.fn(),
		onStartNewSession: vi.fn(),
		onOpenExistingProject: vi.fn(),
		projectConfig: {
			open: false,
			projectName: "",
			content: "",
			status: "idle",
			dirty: false,
			openForProject: vi.fn(),
			close: vi.fn(),
			changeContent: vi.fn(),
			save: vi.fn(async () => undefined),
		},
		onConfigureProject: vi.fn(),
		...overrides,
	};
}

describe("AllstarDevHomePageView", () => {
	it("loading 态渲染加载指示与文案", () => {
		render(<AllstarDevHomePageView model={model({ loading: true })} />);
		expect(screen.getByText("loading")).toBeDefined();
		expect(screen.queryByText("dev projects")).toBeNull();
	});

	it("团队会话行带标识展示，点击把整条会话对象交给打开回调（由 model 分派团队路由）", async () => {
		const user = userEvent.setup();
		const onOpenSession = vi.fn();
		const teamSession = {
			kind: "team" as const,
			path: "C:/sessions/coord.jsonl",
			title: "eform 五角色彩排",
			teamId: "team-1",
			teamSessionId: "ts-1",
		};
		render(
			<AllstarDevHomePageView
				model={model({
					onOpenSession,
					projectCards: [
						{ cwd: "/proj/a", registered: true, projectName: "a", sessions: [teamSession], totalSessions: 1 },
					],
				})}
			/>,
		);
		expect(screen.getByTitle("team session")).toBeDefined();
		await user.click(screen.getByRole("button", { name: "eform 五角色彩排" }));
		expect(onOpenSession).toHaveBeenCalledWith("/proj/a", teamSession);
	});

	it("空态：说明占位，底部新会话区仍可用并携带所选项目", async () => {
		const user = userEvent.setup();
		const onStartNewSession = vi.fn();
		render(<AllstarDevHomePageView model={model({ onStartNewSession })} />);
		expect(screen.getByText("no sessions")).toBeDefined();
		expect(screen.getByText("pick a project above")).toBeDefined();

		await user.click(screen.getByRole("button", { name: "new dev session" }));
		expect(onStartNewSession).toHaveBeenCalledWith("/proj/a");
	});

	it("卡片网格：项目名、会话行点击打开、超出上限显示还有 N 条；新会话只在底部区", async () => {
		const user = userEvent.setup();
		const onOpenSession = vi.fn();
		const onStartNewSession = vi.fn();
		const onConfigureProject = vi.fn();
		render(
			<AllstarDevHomePageView
				model={model({
					onOpenSession,
					onStartNewSession,
					onConfigureProject,
					projectCards: [
						{
							cwd: "/proj/a",
							projectName: "a",
							registered: false,
							totalSessions: 6,
							sessions: [
								{ kind: "chat", path: "/shard/a/a1.jsonl", title: "修登录缺陷" },
								{ kind: "chat", path: "/shard/a/a2.jsonl", title: "数据看板" },
							],
						},
						{
							cwd: "/proj/b",
							projectName: "b",
							registered: true,
							totalSessions: 1,
							sessions: [{ kind: "chat", path: "/shard/b/b1.jsonl", title: "环境配置" }],
						},
					],
				})}
			/>,
		);

		// 项目名与行内容（"a" 与底部选择区当前值同名，用 b 与行文案证明卡片渲染）。
		expect(screen.getByText("b")).toBeDefined();
		expect(screen.getByText("环境配置")).toBeDefined();
		expect(screen.getByText("4 more")).toBeDefined();

		await user.click(screen.getByRole("button", { name: /修登录缺陷/ }));
		expect(onOpenSession).toHaveBeenCalledWith("/proj/a", {
			kind: "chat",
			path: "/shard/a/a1.jsonl",
			title: "修登录缺陷",
		});

		await user.click(screen.getAllByRole("button", { name: "project config" })[0]!);
		expect(onConfigureProject).toHaveBeenCalledWith("/proj/a", "a");

		// 新会话按钮只在底部区出现一枚（卡片不再各带按钮），携带所选项目。
		const newButtons = screen.getAllByRole("button", { name: "new dev session" });
		expect(newButtons).toHaveLength(1);
		await user.click(newButtons[0]!);
		expect(onStartNewSession).toHaveBeenCalledWith("/proj/a");
	});

	it("项目配置信息面板展示文件编辑器并提交更改", async () => {
		const user = userEvent.setup();
		const changeContent = vi.fn();
		const save = vi.fn(async () => undefined);
		render(
			<AllstarDevHomePageView
				model={model({
					projectConfig: {
						open: true,
						projectName: "a",
						content: "## Git",
						status: "ready",
						dirty: true,
						openForProject: vi.fn(),
						close: vi.fn(),
						changeContent,
						save,
					},
				})}
			/>,
		);

		expect(screen.getByText("project configuration")).toBeDefined();
		expect(screen.getByText("do not store secrets")).toBeDefined();
		const editor = screen.getByRole("textbox", { name: "configuration notes" });
		expect(editor).toHaveProperty("value", "## Git");
		fireEvent.change(editor, { target: { value: "## Git\nmain branch" } });
		expect(changeContent).toHaveBeenLastCalledWith("## Git\nmain branch");
		await user.click(screen.getByRole("button", { name: "save config" }));
		expect(save).toHaveBeenCalledTimes(1);
	});
});
