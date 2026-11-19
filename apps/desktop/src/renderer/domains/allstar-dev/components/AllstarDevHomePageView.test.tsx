// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * 版块首页 View 的渲染合同：页头主操作 / 自适应卡片网格（会话截取、卡内新建、
 * 全部 N 个入口、项目操作菜单）/ 空态引导。View 只消费 view model——用 fixture
 * 直接驱动，不挂真实 model。
 *
 * radix 的浮层原语在 jsdom 下依赖大量布局 API，仓库既有做法（见
 * session-context-menu.test.tsx）是把 dropdown-menu 换成结构等价的轻量实现：
 * 菜单树渲染与回调路由是被测对象，开合与定位行为交给 radix 自己的测试。
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
	AllstarDevCardSession,
	AllstarDevHomePageModel,
} from "../hooks/useAllstarDevHomePageModel";
import { AllstarDevHomePageView } from "./AllstarDevHomePageView";

vi.mock("@shared/components/ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
	DropdownMenuContent: ({ children }: { children: ReactNode }) => <div role="menu">{children}</div>,
	// 菜单项用 div 而非原生 button：设计守卫 D03 禁止手写 <button>，mock 不受豁免。
	DropdownMenuItem: ({ children, onSelect }: { children?: ReactNode; onSelect?: (event: Event) => void }) => (
		<div
			role="menuitem"
			tabIndex={0}
			onClick={() => onSelect?.({} as Event)}
			onKeyDown={(event) => {
				if (event.key !== "Enter" && event.key !== " ") return;
				event.preventDefault();
				onSelect?.({} as Event);
			}}
		>
			{children}
		</div>
	),
	DropdownMenuSeparator: () => <hr />,
}));

const LABELS: AllstarDevHomePageModel["labels"] = {
	title: "allstar dev home",
	intro: "intro",
	loading: "loading",
	projectsTitle: "dev projects",
	projectCount: (count: number) => `${count} projects`,
	newSession: "new dev session",
	moreSessions: (count: number) => `all ${count}`,
	teamSession: "team session",
	emptyTitle: "no sessions",
	emptyHint: "pick a project above",
	emptyCardHint: "no dev sessions on this card",
	openProject: "open project",
	configureProject: "project config",
	projectActions: "project actions",
	sessionCount: (count: number) => `${count} sessions`,
	revealInFolder: "reveal in folder",
	removeFromBoard: "remove from board",
	cardNewSession: "new session",
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
		onOpenSession: vi.fn(),
		onStartNewSession: vi.fn(),
		onOpenExistingProject: vi.fn(),
		onOpenAllSessions: vi.fn(),
		onRevealProject: vi.fn(),
		onRemoveFromBoard: vi.fn(),
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

function chatSession(index: number, cwd = "a"): AllstarDevCardSession {
	return {
		kind: "chat",
		path: `/shard/${cwd}/${cwd}${index}.jsonl`,
		title: `${cwd} 会话 ${index}`,
		modifiedAt: index,
	};
}

describe("AllstarDevHomePageView", () => {
	it("loading 态渲染加载指示与文案", () => {
		render(<AllstarDevHomePageView model={model({ loading: true })} />);
		expect(screen.getByText("loading")).toBeDefined();
		expect(screen.queryByText("dev projects")).toBeNull();
	});

	it("页头展示标题与副标题；空态说明占位，主操作仍可用", async () => {
		const user = userEvent.setup();
		const onStartNewSession = vi.fn();
		const onOpenExistingProject = vi.fn();
		render(
			<AllstarDevHomePageView
				model={model({ onStartNewSession, onOpenExistingProject })}
			/>,
		);
		expect(screen.getByText("allstar dev home")).toBeDefined();
		expect(screen.getByText("intro")).toBeDefined();
		expect(screen.getByText("no sessions")).toBeDefined();
		expect(screen.getByText("pick a project above")).toBeDefined();

		await user.click(screen.getByRole("button", { name: "open project" }));
		expect(onOpenExistingProject).toHaveBeenCalledTimes(1);
		// 唯一项目候选：点按直接进入创建，不经过选择层。
		await user.click(screen.getByRole("button", { name: "new dev session" }));
		expect(onStartNewSession).toHaveBeenCalledWith("/proj/a");
	});

	it("多项目时「新建开发会话」经项目下拉选择目标后创建", async () => {
		const user = userEvent.setup();
		const onStartNewSession = vi.fn();
		render(
			<AllstarDevHomePageView
				model={model({
					onStartNewSession,
					projects: [
						{ cwd: "/proj/a", name: "a" },
						{ cwd: "/proj/b", name: "b" },
					],
				})}
			/>,
		);
		await user.click(screen.getByRole("menuitem", { name: "b" }));
		expect(onStartNewSession).toHaveBeenCalledWith("/proj/b");
	});

	it("卡片网格自适应布局：minmax 列宽，不再横向滚动、无固定窄卡宽", () => {
		const { container } = render(
			<AllstarDevHomePageView
				model={model({
					projectCards: [
						{ cwd: "/proj/a", registered: true, projectName: "a", sessions: [chatSession(1)], totalSessions: 1 },
						{ cwd: "/proj/b", registered: true, projectName: "b", sessions: [chatSession(1, "b")], totalSessions: 1 },
					],
				})}
			/>,
		);
		const grid = container.querySelector<HTMLElement>("div.grid");
		expect(grid).not.toBeNull();
		expect(grid?.className).toContain("grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]");
		expect(grid?.className).not.toContain("overflow-x-auto");
		const articles = container.querySelectorAll("article");
		expect(articles).toHaveLength(2);
		for (const article of articles) {
			expect(article.className).not.toContain("w-60");
			expect(article.className).not.toContain("shrink-0");
		}
	});

	it("项目卡片：会话数带单位、只直显前 4 条，点击行打开会话", async () => {
		const user = userEvent.setup();
		const onOpenSession = vi.fn();
		const sessions = Array.from({ length: 6 }, (_, index) => chatSession(6 - index));
		render(
			<AllstarDevHomePageView
				model={model({
					onOpenSession,
					projectCards: [
						{ cwd: "/proj/a", registered: true, projectName: "a", sessions, totalSessions: 6 },
					],
				})}
			/>,
		);
		expect(screen.getByText("6 sessions")).toBeDefined();
		// 只直显传入顺序的前 4 条（model 已按 modifiedAt 降序），其余截断。
		for (const title of ["a 会话 6", "a 会话 5", "a 会话 4", "a 会话 3"]) {
			expect(screen.getByRole("button", { name: title })).toBeDefined();
		}
		expect(screen.queryByRole("button", { name: "a 会话 2" })).toBeNull();
		expect(screen.queryByRole("button", { name: "a 会话 1" })).toBeNull();

		await user.click(screen.getByRole("button", { name: "a 会话 6" }));
		expect(onOpenSession).toHaveBeenCalledWith("/proj/a", sessions[0]);
	});

	it("会话超过 4 条显示「全部 N 个」并回调；不超过时不显示", async () => {
		const user = userEvent.setup();
		const onOpenAllSessions = vi.fn();
		const many = Array.from({ length: 5 }, (_, index) => chatSession(5 - index));
		const few = [chatSession(2), chatSession(1)];
		render(
			<AllstarDevHomePageView
				model={model({
					onOpenAllSessions,
					projectCards: [
						{ cwd: "/proj/a", registered: true, projectName: "a", sessions: many, totalSessions: 5 },
						{ cwd: "/proj/b", registered: true, projectName: "b", sessions: few, totalSessions: 2 },
					],
				})}
			/>,
		);
		const allButton = screen.getByRole("button", { name: "all 5" });
		expect(allButton).toBeDefined();
		expect(screen.queryByRole("button", { name: "all 2" })).toBeNull();

		await user.click(allButton);
		expect(onOpenAllSessions).toHaveBeenCalledWith("/proj/a");
	});

	it("卡片「···」菜单：三项操作齐备，配置/文件夹/移除回调携带卡片信息", async () => {
		const user = userEvent.setup();
		const onConfigureProject = vi.fn();
		const onRevealProject = vi.fn();
		const onRemoveFromBoard = vi.fn();
		const { container } = render(
			<AllstarDevHomePageView
				model={model({
					onConfigureProject,
					onRevealProject,
					onRemoveFromBoard,
					projectCards: [
						{ cwd: "/proj/a", registered: true, projectName: "a", sessions: [chatSession(1)], totalSessions: 1 },
					],
				})}
			/>,
		);
		const [article] = container.querySelectorAll("article");
		expect(article).toBeDefined();
		const card = within(article as HTMLElement);
		expect(card.getByRole("button", { name: "project actions" })).toBeDefined();
		expect(card.getByRole("menuitem", { name: "project config" })).toBeDefined();
		expect(card.getByRole("menuitem", { name: "reveal in folder" })).toBeDefined();
		expect(card.getByRole("menuitem", { name: "remove from board" })).toBeDefined();

		await user.click(card.getByRole("menuitem", { name: "project config" }));
		expect(onConfigureProject).toHaveBeenCalledWith("/proj/a", "a");
		await user.click(card.getByRole("menuitem", { name: "reveal in folder" }));
		expect(onRevealProject).toHaveBeenCalledWith("/proj/a");
		await user.click(card.getByRole("menuitem", { name: "remove from board" }));
		expect(onRemoveFromBoard).toHaveBeenCalledWith("/proj/a");
	});

	it("0 会话卡片：空态文案 + 卡内新建携带卡片 cwd，不渲染「全部 N 个」", async () => {
		const user = userEvent.setup();
		const onStartNewSession = vi.fn();
		render(
			<AllstarDevHomePageView
				model={model({
					onStartNewSession,
					projectCards: [
						{ cwd: "/proj/a", registered: true, projectName: "a", sessions: [], totalSessions: 0 },
					],
				})}
			/>,
		);
		expect(screen.getByText("no dev sessions on this card")).toBeDefined();
		expect(screen.getByText("0 sessions")).toBeDefined();
		expect(screen.queryByRole("button", { name: /^all \d+$/ })).toBeNull();

		await user.click(screen.getByRole("button", { name: "new session" }));
		expect(onStartNewSession).toHaveBeenCalledWith("/proj/a");
	});

	it("团队会话行带标识展示，点击把整条会话对象交给打开回调（由 model 分派团队路由）", async () => {
		const user = userEvent.setup();
		const onOpenSession = vi.fn();
		const teamSession = {
			kind: "team" as const,
			path: "C:/sessions/coord.jsonl",
			title: "eform 五角色彩排",
			modifiedAt: 4,
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
