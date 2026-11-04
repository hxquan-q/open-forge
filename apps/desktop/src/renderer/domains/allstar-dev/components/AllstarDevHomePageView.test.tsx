// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * 版块首页 View 的渲染合同：loading / 卡片网格（会话打开、每卡新建、还有 N 条）/ 空态
 * 引导。View 只消费 view model——用 fixture 直接驱动，不挂真实 model。
 */
import { render, screen } from "@testing-library/react";
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
	emptyTitle: "no sessions",
	emptyHint: "pick a project above",
	emptyCardHint: "no dev sessions on this card",
	emptyProjectLabel: "pick project",
	openProject: "open project",
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
		...overrides,
	};
}

describe("AllstarDevHomePageView", () => {
	it("loading 态渲染加载指示与文案", () => {
		render(<AllstarDevHomePageView model={model({ loading: true })} />);
		expect(screen.getByText("loading")).toBeDefined();
		expect(screen.queryByText("dev projects")).toBeNull();
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
		render(
			<AllstarDevHomePageView
				model={model({
					onOpenSession,
					onStartNewSession,
					projectCards: [
						{
							cwd: "/proj/a",
							projectName: "a",
							registered: true,
							totalSessions: 6,
							sessions: [
								{ path: "/shard/a/a1.jsonl", title: "修登录缺陷" },
								{ path: "/shard/a/a2.jsonl", title: "数据看板" },
							],
						},
						{
							cwd: "/proj/b",
							projectName: "b",
							registered: true,
							totalSessions: 1,
							sessions: [{ path: "/shard/b/b1.jsonl", title: "环境配置" }],
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
		expect(onOpenSession).toHaveBeenCalledWith("/proj/a", "/shard/a/a1.jsonl");

		// 新会话按钮只在底部区出现一枚（卡片不再各带按钮），携带所选项目。
		const newButtons = screen.getAllByRole("button", { name: "new dev session" });
		expect(newButtons).toHaveLength(1);
		await user.click(newButtons[0]!);
		expect(onStartNewSession).toHaveBeenCalledWith("/proj/a");
	});
});
