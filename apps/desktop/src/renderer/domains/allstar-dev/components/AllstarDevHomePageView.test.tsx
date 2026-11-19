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
import { useState } from "react";
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
	emptyTitle: "no sessions",
	emptyHint: "pick a project above",
	emptyCardHint: "no dev sessions on this card",
	openProject: "open project",
	configureProject: "project config",
	projectActions: "project actions",
	sessionCount: (count: number) => `${count} sessions`,
	revealInFolder: "reveal in folder",
	removeFromBoard: "remove from board",
	sessionActions: "session actions",
	renameSession: "rename session",
	revealSessionInFolder: "reveal session in folder",
	deleteSession: "delete session",
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
	sessionsDialogDescription: "all dev sessions",
	sessionsDialogSearchPlaceholder: "search sessions",
	sessionsDialogNoResults: "no matching sessions",
	sessionsDialogClose: "close dialog",
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
		onCloseSessions: vi.fn(),
		sessionsDialog: { open: false, cwd: null },
		onRevealProject: vi.fn(),
		onRenameSession: vi.fn(),
		onRevealSession: vi.fn(),
		onDeleteSession: vi.fn(),
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

/**
 * 会话标题按钮所在的行容器：行结构断言与行内菜单寻址都用它，
 * 避免把「标题按钮」误当成「整行」。
 */
function sessionRowOf(titleButton: HTMLElement): HTMLElement {
	const row = titleButton.parentElement;
	if (!row) throw new Error("session row container not found");
	return row;
}

function chatSession(index: number, cwd = "a"): AllstarDevCardSession {
	return {
		kind: "chat",
		path: `/shard/${cwd}/${cwd}${index}.jsonl`,
		title: `${cwd} 会话 ${index}`,
		modifiedAt: index,
	};
}

/**
 * 全部会话弹窗的有状态装配：真实 model 的弹窗状态 { open, cwd } 驻留在 hook 里，
 * 这里用等价的 useState 模拟 open/close 行为，验证 View → 弹窗的完整接线
 * （点「全部 N 个」打开、关闭回调复位）。
 */
function renderHomePageWithSessionsDialog(overrides: Partial<AllstarDevHomePageModel> = {}): void {
	function SessionsDialogHarness(): JSX.Element {
		const [dialog, setDialog] = useState<{ open: boolean; cwd: string | null }>({
			open: false,
			cwd: null,
		});
		const viewmodel = model({
			...overrides,
			sessionsDialog: dialog,
			onOpenAllSessions: (cwd: string) => setDialog({ open: true, cwd }),
			onCloseSessions: () => setDialog({ open: false, cwd: null }),
		});
		return <AllstarDevHomePageView model={viewmodel} />;
	}
	render(<SessionsDialogHarness />);
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
		expect(grid?.className).toContain("grid-cols-[repeat(auto-fill,minmax(16.25rem,1fr))]");
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

	it("团队会话行不做特质化展示，点击把整条会话对象交给打开回调（由 model 分派团队路由）", async () => {
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
		// 团队会话行与普通行一视同仁：无 team title、无团队图标（与弹窗口径一致）。
		expect(screen.queryByTitle("team session")).toBeNull();
		expect(screen.queryByText("eform 五角色彩排")).toBeDefined();
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

describe("AllstarDevSessionsDialog（全部会话弹窗）", () => {
	/**
	 * 弹窗行用标题作为可访问名；标题混排英文/中文以覆盖大小写不敏感过滤。
	 * 会话数必须 > 4：「全部 N 个」入口只在超过卡片直显条数（4）时渲染。
	 */
	function dialogSessions(): AllstarDevCardSession[] {
		return [
			{
				kind: "chat",
				path: "/shard/a/login.jsonl",
				title: "Fix Login Bug",
				modifiedAt: 6,
			},
			{
				kind: "chat",
				path: "/shard/a/api.jsonl",
				title: "Refactor API client",
				modifiedAt: 5,
			},
			{
				kind: "chat",
				path: "/shard/a/style.jsonl",
				title: "登录页样式",
				modifiedAt: 4,
			},
			{
				kind: "chat",
				path: "/shard/a/docs.jsonl",
				title: "Update docs",
				modifiedAt: 3,
			},
			{
				kind: "chat",
				path: "/shard/a/misc.jsonl",
				title: "杂项清理",
				modifiedAt: 2,
			},
			{
				kind: "chat",
				path: "/shard/a/init.jsonl",
				title: "项目初始化",
				modifiedAt: 1,
			},
		];
	}

	function oneCardProject(
		sessions: readonly AllstarDevCardSession[],
	): AllstarDevHomePageModel["projectCards"] {
		return [{ cwd: "/proj/a", registered: true, projectName: "a", sessions, totalSessions: sessions.length }];
	}

	it("「全部 N 个」打开弹窗：列出全部会话（含团队行，不按 4 条截断），焦点落搜索框", async () => {
		const user = userEvent.setup();
		const teamSession: AllstarDevCardSession = {
			kind: "team",
			path: "C:/sessions/coord.jsonl",
			title: "团队彩排",
			modifiedAt: 7,
			teamId: "team-1",
			teamSessionId: "ts-1",
		};
		const chatOnly = Array.from({ length: 6 }, (_, index) => chatSession(6 - index));
		const sessions = [teamSession, ...chatOnly];
		renderHomePageWithSessionsDialog({ projectCards: oneCardProject(sessions) });

		await user.click(screen.getByRole("button", { name: "all 7" }));

		const dialog = screen.getByRole("dialog");
		// head：项目名 + body-top 计数；弹窗内平铺全部 7 条（卡片只直显 4 条）。
		expect(within(dialog).getByText("a")).toBeDefined();
		expect(within(dialog).getByText("7 sessions")).toBeDefined();
		// 团队行不做特质化标识（与普通行一视同仁）；行结构一致性见独立用例。
		expect(within(dialog).queryByTitle("team session")).toBeNull();
		for (let index = 1; index <= 6; index += 1) {
			expect(within(dialog).getByRole("button", { name: `a 会话 ${index}` })).toBeDefined();
		}
		expect(within(dialog).getByRole("button", { name: "团队彩排" })).toBeDefined();
		// 打开后焦点落在搜索框，可直接键入过滤。
		const search = within(dialog).getByPlaceholderText("search sessions");
		expect(document.activeElement).toBe(search);
	});

	it("弹窗中团队会话与普通会话行结构一致：无团队图标、无团队 title，只有标题按钮 + ··· 菜单", async () => {
		const user = userEvent.setup();
		const teamSession: AllstarDevCardSession = {
			kind: "team",
			path: "C:/sessions/coord.jsonl",
			title: "团队彩排",
			modifiedAt: 7,
			teamId: "team-1",
			teamSessionId: "ts-1",
		};
		const chatOnly = Array.from({ length: 4 }, (_, index) => chatSession(4 - index));
		renderHomePageWithSessionsDialog({
			projectCards: oneCardProject([teamSession, ...chatOnly]),
		});
		await user.click(screen.getByRole("button", { name: "all 5" }));

		const dialog = screen.getByRole("dialog");
		const teamRow = sessionRowOf(within(dialog).getByRole("button", { name: "团队彩排" }));
		const chatRow = sessionRowOf(within(dialog).getByRole("button", { name: "a 会话 4" }));
		for (const row of [teamRow, chatRow]) {
			// 行内只有标题按钮与行尾 ··· 菜单；无 users-group 图标、无 team title。
			expect(row.getAttribute("title")).toBeNull();
			expect(row.querySelector(".icon-\\[solar--users-group-rounded-linear\\]")).toBeNull();
			expect(row.children).toHaveLength(2);
			expect(row.querySelector(".truncate")).not.toBeNull();
			expect(within(row).getByRole("button", { name: "session actions" })).toBeDefined();
		}
	});

	it("卡片行与弹窗行结构一致：同一会话在两处的子元素类名序列完全相同", async () => {
		const user = userEvent.setup();
		const teamSession: AllstarDevCardSession = {
			kind: "team",
			path: "C:/sessions/coord.jsonl",
			title: "团队彩排",
			modifiedAt: 7,
			teamId: "team-1",
			teamSessionId: "ts-1",
		};
		const chatOnly = Array.from({ length: 4 }, (_, index) => chatSession(4 - index));
		renderHomePageWithSessionsDialog({
			projectCards: oneCardProject([teamSession, ...chatOnly]),
		});

		// 弹窗打开前，「团队彩排」行只存在于卡片（卡片直显前 4 条）。
		const cardRow = sessionRowOf(screen.getByRole("button", { name: "团队彩排" }));
		expect(cardRow.getAttribute("title")).toBeNull();
		expect(cardRow.querySelector(".icon-\\[solar--users-group-rounded-linear\\]")).toBeNull();
		expect(cardRow.children).toHaveLength(2);

		await user.click(screen.getByRole("button", { name: "all 5" }));
		const dialogRow = sessionRowOf(within(screen.getByRole("dialog")).getByRole("button", { name: "团队彩排" }));
		// 两处行结构（标题按钮 + ··· 菜单按钮的类名序列）完全一致。
		const childClassNames = (row: HTMLElement) =>
			Array.from(row.children, (child) => (child as HTMLElement).className);
		expect(childClassNames(dialogRow)).toEqual(childClassNames(cardRow));
	});

	it("行尾「···」是独立菜单入口：点它不打开会话，只展开三项动作", async () => {
		const user = userEvent.setup();
		const session = chatSession(1);
		const onOpenSession = vi.fn();
		render(
			<AllstarDevHomePageView
				model={model({
					projectCards: [
						{ cwd: "/proj/a", registered: true, projectName: "a", sessions: [session], totalSessions: 1 },
					],
					onOpenSession,
				})}
			/>,
		);

		const row = sessionRowOf(screen.getByRole("button", { name: session.title }));
		await user.click(within(row).getByRole("button", { name: "session actions" }));

		// 核心回归：点 ··· 不再冒泡成「打开会话」。
		expect(onOpenSession).not.toHaveBeenCalled();
		expect(within(row).getByRole("menuitem", { name: "rename session" })).toBeDefined();
		expect(within(row).getByRole("menuitem", { name: "reveal session in folder" })).toBeDefined();
		expect(within(row).getByRole("menuitem", { name: "delete session" })).toBeDefined();
	});

	it("会话菜单三项各自回调：重命名（Enter 提交）、在文件夹中打开、删除", async () => {
		const user = userEvent.setup();
		const session = chatSession(1);
		const onRenameSession = vi.fn();
		const onRevealSession = vi.fn();
		const onDeleteSession = vi.fn();
		render(
			<AllstarDevHomePageView
				model={model({
					projectCards: [
						{ cwd: "/proj/a", registered: true, projectName: "a", sessions: [session], totalSessions: 1 },
					],
					onRenameSession,
					onRevealSession,
					onDeleteSession,
				})}
			/>,
		);

		const row = sessionRowOf(screen.getByRole("button", { name: session.title }));
		await user.click(within(row).getByRole("menuitem", { name: "reveal session in folder" }));
		expect(onRevealSession).toHaveBeenCalledWith("/proj/a");

		await user.click(within(row).getByRole("menuitem", { name: "delete session" }));
		expect(onDeleteSession).toHaveBeenCalledWith("/proj/a", session);

		await user.click(within(row).getByRole("menuitem", { name: "rename session" }));
		const editor = within(row).getByRole("textbox", { name: "rename session" });
		await user.clear(editor);
		await user.type(editor, "新标题{Enter}");
		expect(onRenameSession).toHaveBeenCalledWith("/proj/a", session, "新标题");
		// 提交后退出编辑态，标题恢复成按钮。
		expect(within(row).getByRole("button", { name: session.title })).toBeDefined();
	});

	it("搜索按标题过滤（去首尾空格、大小写不敏感）；无匹配显示提示", async () => {
		const user = userEvent.setup();
		renderHomePageWithSessionsDialog({ projectCards: oneCardProject(dialogSessions()) });
		await user.click(screen.getByRole("button", { name: "all 6" }));
		let dialog = screen.getByRole("dialog");
		const search = within(dialog).getByPlaceholderText("search sessions");

		// 关键词带首尾空格且大小写与标题不一致：仍应命中标题含 "API" 的那一行。
		await user.type(search, "  API  ");
		expect(within(dialog).queryByRole("button", { name: "Refactor API client" })).toBeDefined();
		expect(within(dialog).queryByRole("button", { name: "Fix Login Bug" })).toBeNull();
		expect(within(dialog).queryByRole("button", { name: "登录页样式" })).toBeNull();

		await user.clear(search);
		await user.type(search, "不存在的词");
		dialog = screen.getByRole("dialog");
		expect(within(dialog).getByText("no matching sessions")).toBeDefined();
		expect(within(dialog).queryByRole("button", { name: "Fix Login Bug" })).toBeNull();
	});

	it("点击弹窗行把卡片 cwd 与整条会话对象交给 onOpenSession（分派逻辑仍在 model）", async () => {
		const user = userEvent.setup();
		const onOpenSession = vi.fn();
		const sessions = dialogSessions();
		renderHomePageWithSessionsDialog({ onOpenSession, projectCards: oneCardProject(sessions) });
		await user.click(screen.getByRole("button", { name: "all 6" }));

		await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Fix Login Bug" }));
		expect(onOpenSession).toHaveBeenCalledWith("/proj/a", sessions[0]);
	});

	it("「新建会话」先关弹窗再跳转：onStartNewSession 携带 cwd 且弹窗消失", async () => {
		const user = userEvent.setup();
		const onStartNewSession = vi.fn();
		renderHomePageWithSessionsDialog({
			onStartNewSession,
			projectCards: oneCardProject(dialogSessions()),
		});
		await user.click(screen.getByRole("button", { name: "all 6" }));

		const dialog = screen.getByRole("dialog");
		await user.click(within(dialog).getByRole("button", { name: "new session" }));
		expect(onStartNewSession).toHaveBeenCalledWith("/proj/a");
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("× 与 Esc 都能关闭；重新打开后搜索关键字已清空", async () => {
		const user = userEvent.setup();
		renderHomePageWithSessionsDialog({ projectCards: oneCardProject(dialogSessions()) });
		await user.click(screen.getByRole("button", { name: "all 6" }));
		let dialog = screen.getByRole("dialog");
		await user.type(within(dialog).getByPlaceholderText("search sessions"), "login");

		await user.click(within(dialog).getByRole("button", { name: "close dialog" }));
		expect(screen.queryByRole("dialog")).toBeNull();

		// 重新打开：关键字随弹窗卸载清空。
		await user.click(screen.getByRole("button", { name: "all 6" }));
		dialog = screen.getByRole("dialog");
		expect(within(dialog).getByPlaceholderText("search sessions")).toHaveProperty("value", "");

		// Esc 同样走关闭链路。
		await user.type(within(dialog).getByPlaceholderText("search sessions"), "api");
		fireEvent.keyDown(dialog, { key: "Escape" });
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("按 cwd 找不到卡片（版块册刷新/项目被移出）：弹窗不渲染、不抛错", () => {
		render(
			<AllstarDevHomePageView
				model={model({
					sessionsDialog: { open: true, cwd: "/proj/gone" },
					projectCards: oneCardProject(dialogSessions()),
				})}
			/>,
		);
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});
