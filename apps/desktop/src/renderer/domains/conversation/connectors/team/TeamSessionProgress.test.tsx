// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeamSessionProgress } from "./TeamSessionProgress";
import type { TeamSessionProgress as TeamSessionProgressModel } from "./team-session-progress";

const LABELS: Record<string, string> = {
	"chat.teamProgress.title": "团队任务进度",
	"chat.teamProgress.phase.dispatching": "已分派",
	"chat.teamProgress.phase.running": "执行中",
	"chat.teamProgress.phase.waiting": "等待中",
	"chat.teamProgress.phase.attention": "需要处理",
	"chat.teamProgress.phase.wrapping": "收尾中",
	"chat.teamProgress.phase.settled": "已结束",
	"chat.teamProgress.count.queued": "待开始 {{count}}",
	"chat.teamProgress.count.running": "进行中 {{count}}",
	"chat.teamProgress.count.waiting": "等待中 {{count}}",
	"chat.teamProgress.count.attention": "待处理 {{count}}",
	"chat.teamProgress.count.completed": "已完成 {{count}}",
	"chat.teamProgress.count.failed": "失败 {{count}}",
	"chat.teamProgress.count.cancelled": "已取消 {{count}}",
	"chat.teamProgress.item.queued": "等待开始",
	"chat.teamProgress.item.running": "执行中",
	"chat.teamProgress.item.waiting": "等待中",
	"chat.teamProgress.item.attention": "需要处理",
	"chat.teamProgress.item.completed": "已完成",
	"chat.teamProgress.item.failed": "失败",
	"chat.teamProgress.item.cancelled": "已取消",
	"chat.teamProgress.item.notStarted": "未开始",
	"chat.teamProgress.metrics": "↻{{rounds}} · 工具 {{tools}} · ↑{{input}} ↓{{output}} · {{duration}}",
	"chat.teamProgress.context": "上下文 {{percent}}%",
	"chat.teamProgress.liveStatus": "{{title}}：{{phase}}",
	"chat.teamProgress.total": "合计",
	"chat.leaderRoute": "负责人",
	"chat.memberSession": "查看 {{name}} 的独立会话",
};

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, values?: Record<string, unknown>) => {
			let template = LABELS[key] ?? key;
			for (const [name, value] of Object.entries(values ?? {})) {
				template = template.replace(`{{${name}}}`, String(value));
			}
			return template;
		},
	}),
}));

vi.mock("@vetta-org/theme-ui/chat", () => ({
	AgentAvatarView: ({ name }: { name: string }) => <span data-avatar={name} />,
}));

afterEach(cleanup);

function progress(overrides: Partial<TeamSessionProgressModel> = {}): TeamSessionProgressModel {
	return {
		phase: "running",
		total: 3,
		activeCount: 2,
		counts: { queued: 0, running: 1, waiting: 1, attention: 0, completed: 1, failed: 0, cancelled: 0 },
		rows: [
			{
				memberId: "leader",
				name: "Lead",
				isLeader: true,
				itemCount: 0,
				openable: false,
			},
			{
				memberId: "developer",
				name: "Dev",
				isLeader: false,
				state: "running",
				objective: "实现页面",
				itemCount: 1,
				openable: true,
				usage: { rounds: 2, toolCalls: 3, inputTokens: 1200, outputTokens: 300, durationMs: 62_500 },
			},
			{
				memberId: "reviewer",
				name: "Review",
				isLeader: false,
				state: "waiting",
				objective: "审计改动",
				itemCount: 2,
				openable: false,
			},
		],
		totals: { rounds: 2, toolCalls: 3, inputTokens: 1200, outputTokens: 300, durationMs: 62_500 },
		...overrides,
	};
}

describe("TeamSessionProgress", () => {
	it("shows the session phase and per-state counts without opening the member list", () => {
		render(<TeamSessionProgress progress={progress()} onOpenMember={vi.fn()} />);
		const toggle = screen.getByRole("button", { expanded: false });
		expect(toggle.textContent).toContain("执行中");
		expect(toggle.textContent).toContain("进行中 1");
		expect(toggle.textContent).toContain("等待中 1");
		expect(toggle.textContent).toContain("已完成 1");
		expect(screen.queryByRole("listitem")).toBeNull();
	});

	it("expands to list each member's current work item and state", () => {
		render(<TeamSessionProgress progress={progress()} onOpenMember={vi.fn()} />);
		fireEvent.click(screen.getByRole("button", { expanded: false }));
		expect(screen.getByRole("button", { expanded: true })).toBeTruthy();
		const rows = screen.getAllByRole("listitem");
		expect(rows).toHaveLength(4);
		expect(rows[0]?.textContent).toContain("未开始");
		expect(rows[1]?.textContent).toContain("Dev");
		expect(rows[1]?.textContent).toContain("执行中");
		expect(rows[1]?.textContent).toContain("实现页面");
		expect(rows[2]?.textContent).toContain("×2");
	});

	it("shows each member's rounds, tool calls, tokens and duration plus a session total", () => {
		render(<TeamSessionProgress progress={progress()} onOpenMember={vi.fn()} />);
		fireEvent.click(screen.getByRole("button", { expanded: false }));
		const devRow = document.querySelector('[data-team-progress-member="developer"]');
		expect(devRow?.textContent).toContain("↻2 · 工具 3 · ↑1.2K ↓300 · 1m02s");
		expect(devRow?.textContent).not.toContain("未开始");
		// 未开始成员显示占位态而不是一串 0。
		const leaderRow = document.querySelector('[data-team-progress-member="leader"]');
		expect(leaderRow?.textContent).toContain("未开始");
		expect(leaderRow?.textContent).not.toContain("↻");
		const totalRow = document.querySelector('[data-team-progress-total]');
		expect(totalRow?.textContent).toContain("合计");
		expect(totalRow?.textContent).toContain("↻2 · 工具 3");
	});

	it("opens the member session only for members that have one", () => {
		const onOpenMember = vi.fn();
		render(<TeamSessionProgress progress={progress()} onOpenMember={onOpenMember} />);
		fireEvent.click(screen.getByRole("button", { expanded: false }));
		fireEvent.click(screen.getByRole("button", { name: "查看 Dev 的独立会话" }));
		expect(onOpenMember).toHaveBeenCalledWith("developer");
		// Reviewer has no member session yet: rendered as a plain row, not a button.
		expect(screen.queryByRole("button", { name: /Review/ })).toBeNull();
	});

	it.each([
		{ phase: "dispatching", label: "已分派" },
		{ phase: "attention", label: "需要处理" },
		{ phase: "wrapping", label: "收尾中" },
		{ phase: "settled", label: "已结束" },
	] as const)("announces the $phase phase as $label", ({ phase, label }) => {
		render(<TeamSessionProgress progress={progress({ phase })} onOpenMember={vi.fn()} />);
		expect(screen.getByRole("status").textContent).toContain(label);
	});

	it("keeps the live status outside the toggle button so it survives children-presentational", () => {
		render(<TeamSessionProgress progress={progress()} onOpenMember={vi.fn()} />);
		const toggle = screen.getByRole("button", { expanded: false });
		const status = screen.getByRole("status");
		// button 的后代在真实浏览器里是 presentational：status 挂在里面永远不播报。
		expect(toggle.contains(status)).toBe(false);
		expect(status.textContent).toContain("执行中");
	});

	it("points aria-controls at the expanded member list", () => {
		render(<TeamSessionProgress progress={progress()} onOpenMember={vi.fn()} />);
		const toggle = screen.getByRole("button", { expanded: false });
		expect(toggle.getAttribute("aria-controls")).toBeNull();
		fireEvent.click(toggle);
		const target = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
		expect(target?.getAttribute("role")).toBe("list");
	});

	it("marks the member needing attention with the registered live indicator", () => {
		render(
			<TeamSessionProgress
				progress={progress({
					phase: "attention",
					counts: { queued: 0, running: 0, waiting: 0, attention: 1, completed: 0, failed: 0, cancelled: 0 },
					rows: [
						{
							memberId: "reviewer",
							name: "Review",
							isLeader: false,
							state: "attention",
							objective: "等待确认方案",
							itemCount: 1,
							openable: true,
						},
					],
				})}
				onOpenMember={vi.fn()}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { expanded: false }));
		// 需要处理是唯一要用户行动的状态，与 running 一样挂登记过的呼吸点。
		const row = document.querySelector('[data-team-progress-member="reviewer"]');
		expect(row?.querySelector(".vetta-live-dot")).not.toBeNull();
	});
});
