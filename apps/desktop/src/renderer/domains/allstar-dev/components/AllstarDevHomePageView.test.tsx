// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * 版块首页 View 的渲染合同：loading / 空态 / 列表渲染与会话打开、新建开发会话的动作
 * 接线。View 只消费 view model——用 fixture 直接驱动，不挂真实 model。
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AllstarDevHomePageModel } from "../hooks/useAllstarDevHomePageModel";
import { AllstarDevHomePageView } from "./AllstarDevHomePageView";

const LABELS: AllstarDevHomePageModel["labels"] = {
	intro: "intro",
	loading: "loading",
	quickStartTitle: "quick-start",
	projectLabel: "pick project",
	newSession: "new dev session",
	recentTitle: "recent",
	emptyTitle: "no sessions",
	emptyHint: "pick a project above",
};

function model(overrides: Partial<AllstarDevHomePageModel> = {}): AllstarDevHomePageModel {
	return {
		loading: false,
		labels: LABELS,
		projects: [{ cwd: "/proj/a", name: "a" }],
		selectedCwd: "/proj/a",
		recentSessions: [],
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
		expect(screen.queryByText("quick-start")).toBeNull();
	});

	it("空态：说明为什么空、下一步做什么", () => {
		render(<AllstarDevHomePageView model={model()} />);
		expect(screen.getByText("no sessions")).toBeDefined();
		expect(screen.getByText("pick a project above")).toBeDefined();
	});

	it("近期会话列表渲染会话名与项目名，点击行打开会话", async () => {
		const user = userEvent.setup();
		const onOpenSession = vi.fn();
		render(
			<AllstarDevHomePageView
				model={model({
					recentSessions: [
						{ path: "/shard/a/a1.jsonl", cwd: "/proj/a", title: "修登录缺陷", projectName: "a" },
						{ path: "/shard/b/b1.jsonl", cwd: "/proj/b", title: "数据看板", projectName: "b" },
					],
					onOpenSession,
				})}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /修登录缺陷/ }));
		expect(onOpenSession).toHaveBeenCalledWith("/proj/a", "/shard/a/a1.jsonl");
		// 行内项目名渲染（"a" 同时是 Select 当前值，用 b 证明行内标签存在）。
		expect(screen.getByText("b")).toBeDefined();
	});

	it("新建开发会话按钮触发动作，未选中项目时禁用", async () => {
		const user = userEvent.setup();
		const onStartNewSession = vi.fn();
		const { rerender } = render(
			<AllstarDevHomePageView model={model({ onStartNewSession, selectedCwd: "" })} />,
		);
		const button = screen.getByRole("button", { name: "new dev session" });
		expect(button.hasAttribute("disabled")).toBe(true);

		rerender(<AllstarDevHomePageView model={model({ onStartNewSession })} />);
		await user.click(screen.getByRole("button", { name: "new dev session" }));
		expect(onStartNewSession).toHaveBeenCalledTimes(1);
	});
});
