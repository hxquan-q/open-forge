// @vitest-environment jsdom

import type { ToolCallBlock } from "@shared/store/atoms";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const LABELS: Record<string, string> = {
	"teamWaitTasks.waiting": "等待成员任务的结果",
	"teamWaitTasks.timeout": "仍在等待成员完成（{{count}} 项进行中）",
	"teamWaitTasks.progress": "成员任务有更新",
	"teamWaitTasks.state.queued": "待开始 {{count}}",
	"teamWaitTasks.state.running": "进行中 {{count}}",
	"teamWaitTasks.state.waiting": "等待中 {{count}}",
	"teamWaitTasks.state.attention-required": "需要处理 {{count}}",
	"teamWaitTasks.state.completed": "已完成 {{count}}",
	"teamWaitTasks.state.failed": "失败 {{count}}",
	"teamWaitTasks.state.cancelled": "已取消 {{count}}",
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

import { ToolCallBlockView } from "../ToolCallBlock";
import { summarizeTeamWaitTasksResult } from "./TeamWaitTasksView";

afterEach(cleanup);

function Wrapper({ children }: { children: ReactNode }) {
	return <Provider store={createStore()}>{children}</Provider>;
}

function waitBlock(result: string | undefined): ToolCallBlock {
	return {
		type: "tool_call",
		toolCallId: "wait-call",
		toolName: "team_wait_tasks",
		args: { teamTaskIds: ["t-1"], timeoutMs: 30_000 },
		status: "success",
		...(result !== undefined ? { result } : {}),
	};
}

function renderExpanded(block: ToolCallBlock) {
	const view = render(<ToolCallBlockView block={block} />, { wrapper: Wrapper });
	fireEvent.click(screen.getByRole("button"));
	return view;
}

describe("summarizeTeamWaitTasksResult", () => {
	it("reads the reason and per-state counts out of the serialized payload", () => {
		const summary = summarizeTeamWaitTasksResult(
			JSON.stringify({
				reason: "state-changed",
				tasks: [
					{ teamTaskId: "t-1", workItem: { state: "completed" } },
					{ teamTaskId: "t-2", workItem: { state: "running" } },
					{ teamTaskId: "t-3", workItem: { state: "attention-required" } },
				],
			}),
		);
		expect(summary).toMatchObject({
			reason: "state-changed",
			total: 3,
			active: 2,
			counts: { completed: 1, running: 1, "attention-required": 1 },
		});
	});

	it.each([
		{ label: "非 JSON 文本", result: "not json" },
		{ label: "缺少 reason 字段", result: JSON.stringify({ tasks: [] }) },
		{ label: "reason 不是已知枚举", result: JSON.stringify({ reason: "exploded", tasks: [] }) },
		{ label: "顶层是数组", result: JSON.stringify([]) },
	])("rejects malformed payloads ($label)", ({ result }) => {
		expect(summarizeTeamWaitTasksResult(result)).toBeNull();
	});
});

describe("TeamWaitTasksView via ToolCallBlockView", () => {
	it("collapses a timeout payload into neutral wording instead of raw JSON", () => {
		const result = JSON.stringify({
			reason: "timeout",
			tasks: [
				{ teamTaskId: "t-1", workItem: { id: "w1", state: "running", objective: "抽取数据" } },
				{ teamTaskId: "t-2", workItem: { id: "w2", state: "waiting", objective: "审计" } },
			],
		});
		const { container } = renderExpanded(waitBlock(result));
		expect(screen.getByText("仍在等待成员完成（2 项进行中）")).toBeTruthy();
		expect(container.textContent).not.toContain('"reason"');
		expect(container.textContent).not.toContain("workItem");
		expect(container.textContent).not.toContain("teamTaskId");
	});

	it("summarizes a state-changed payload as per-state counts", () => {
		const result = JSON.stringify({
			reason: "state-changed",
			tasks: [
				{ teamTaskId: "t-1", workItem: { state: "running" } },
				{ teamTaskId: "t-2", workItem: { state: "completed" } },
			],
		});
		renderExpanded(waitBlock(result));
		expect(screen.getByText("成员任务有更新：进行中 1 · 已完成 1")).toBeTruthy();
	});

	it("falls back to neutral wording when the payload cannot be parsed", () => {
		renderExpanded(waitBlock("{ broken json"));
		expect(screen.getByText("等待成员任务的结果")).toBeTruthy();
	});
});
