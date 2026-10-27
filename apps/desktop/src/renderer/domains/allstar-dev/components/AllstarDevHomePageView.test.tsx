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
	emptyProjectLabel: "pick project",
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
		...overrides,
	};
}

describe("AllstarDevHomePageView", () => {
	it("loading 态渲染加载指示与文案", () => {
		render(<AllstarDevHomePageView model={model({ loading: true })} />);
		expect(screen.getByText("loading")).toBeDefined();
		expect(screen.queryByText("dev projects")).toBeNull();
	});

	it("空态：说明 + 项目选择 + 新建按钮；按钮携带所选项目触发动作", async () => {
		const user = userEvent.setup();
		const onStartNewSession = vi.fn();
		render(<AllstarDevHomePageView model={model({ onStartNewSession })} />);
		expect(screen.getByText("no sessions")).toBeDefined();
		expect(screen.getByText("pick a project above")).toBeDefined();

		await user.click(screen.getByRole("button", { name: "new dev session" }));
		expect(onStartNewSession).toHaveBeenCalledWith("/proj/a");
	});

	it("卡片网格：项目名、会话行点击打开、每卡新建按钮、超出上限显示还有 N 条", async () => {
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
							totalSessions: 6,
							sessions: [
								{ path: "/shard/a/a1.jsonl", title: "修登录缺陷" },
								{ path: "/shard/a/a2.jsonl", title: "数据看板" },
							],
						},
						{
							cwd: "/proj/b",
							projectName: "b",
							totalSessions: 1,
							sessions: [{ path: "/shard/b/b1.jsonl", title: "环境配置" }],
						},
					],
				})}
			/>,
		);

		expect(screen.getByText("a")).toBeDefined();
		expect(screen.getByText("b")).toBeDefined();
		expect(screen.getByText("4 more")).toBeDefined();

		await user.click(screen.getByRole("button", { name: /修登录缺陷/ }));
		expect(onOpenSession).toHaveBeenCalledWith("/proj/a", "/shard/a/a1.jsonl");

		// 每卡的新建按钮带自己的 cwd：b 卡的第 1 个"new dev session"（DOM 序）。
		const newButtons = screen.getAllByRole("button", { name: "new dev session" });
		await user.click(newButtons[1]!);
		expect(onStartNewSession).toHaveBeenCalledWith("/proj/b");
	});
});
