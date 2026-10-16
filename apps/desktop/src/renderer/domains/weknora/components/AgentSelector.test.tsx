// @vitest-environment jsdom
// Copyright The Open Forge contributors.

import type { WeKnoraAgent } from "@preload/api";
import { i18n, initI18n } from "@shared/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { AgentSelector } from "./AgentSelector";

// Radix Select 在 jsdom 下需要指针捕获等环境；用可断言的替身（沿用 WeKnoraPage.test 同款做法），
// 把 onValueChange 接到可点击项上，从而验证 AgentSelector 的选择接线本身。
const selectBridge = vi.hoisted(() => ({ onValueChange: null as ((value: string) => void) | null }));

vi.mock("@shared/components/ui/select", () => ({
	Select: ({ children, onValueChange }: { children: React.ReactNode; onValueChange?: (value: string) => void }) => {
		selectBridge.onValueChange = onValueChange ?? null;
		return <div>{children}</div>;
	},
	SelectTrigger: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => (
		<div {...props}>{children}</div>
	),
	SelectValue: () => <span />,
	SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
		<button type="button" data-value={value} onClick={() => selectBridge.onValueChange?.(value)}>
			{children}
		</button>
	),
}));

const AGENTS: WeKnoraAgent[] = [
	{ id: "A", name: "客服一号" },
	{ id: "B", name: "客服二号" },
];

beforeAll(async () => {
	initI18n();
	await i18n.changeLanguage("zh");
});

describe("AgentSelector（AC-17）", () => {
	it("列出全部可见智能体的名称", () => {
		render(<AgentSelector agents={AGENTS} selectedAgentId="A" onSelect={vi.fn()} />);
		expect(screen.getByText("客服一号")).toBeTruthy();
		expect(screen.getByText("客服二号")).toBeTruthy();
	});

	it("选中某一项 → onSelect 收到该 agent 的 id", async () => {
		const onSelect = vi.fn();
		render(<AgentSelector agents={AGENTS} selectedAgentId="A" onSelect={onSelect} />);

		await userEvent.click(screen.getByRole("button", { name: "客服二号" }));

		expect(onSelect).toHaveBeenCalledWith("B");
	});

	it("选择器带无障碍标签（走 i18n）", () => {
		render(<AgentSelector agents={AGENTS} selectedAgentId="A" onSelect={vi.fn()} />);
		expect(screen.getByLabelText(i18n.t("weknora:agent.label"))).toBeTruthy();
	});
});
