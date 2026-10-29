// Copyright The Open Forge contributors.
// @vitest-environment jsdom

import { aiTerminalFeedAtom, type AiTerminalEntry } from "@shared/store/atoms";
import { cleanup, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiTerminalReplayPanel } from "./AiTerminalReplayPanel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

function entry(overrides: Partial<AiTerminalEntry> = {}): AiTerminalEntry {
	return { command: "bun run check", key: "call-1", running: false, at: 1, cwd: "/repo", ...overrides };
}

function renderWithFeed(entries: readonly AiTerminalEntry[]) {
	const store = createStore();
	store.set(aiTerminalFeedAtom, entries);
	const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
	return render(<AiTerminalReplayPanel />, { wrapper });
}

describe("AiTerminalReplayPanel", () => {
	afterEach(() => {
		cleanup();
	});

	it("空态说明会显示什么，而不是留白", () => {
		renderWithFeed([]);
		expect(screen.getByText("activityPanel.terminal.empty")).toBeTruthy();
	});

	it("条目以日志区渲染：命令与输出可见，日志区有可访问名称", () => {
		renderWithFeed([
			entry({ key: "a", command: "git status", output: "nothing to commit" }),
			entry({ key: "b", command: "bun run check" }),
		]);
		const log = screen.getByRole("region", { name: "activityPanel.terminal.title" });
		expect(log).toBeTruthy();
		expect(screen.getByText("git status")).toBeTruthy();
		expect(screen.getByText("nothing to commit")).toBeTruthy();
		// 每条一个命令提示符，均为纯装饰。
		const prompts = screen.getAllByText("$");
		expect(prompts).toHaveLength(2);
		for (const prompt of prompts) expect(prompt.getAttribute("aria-hidden")).toBe("true");
	});

	it("执行中条目有状态提示；已完成条目没有", () => {
		renderWithFeed([
			entry({ key: "running-1", command: "sleep 100", running: true }),
			entry({ key: "done-1", command: "echo done" }),
		]);
		expect(screen.getByRole("status", { name: "activityPanel.terminal.running" })).toBeTruthy();
	});
});
