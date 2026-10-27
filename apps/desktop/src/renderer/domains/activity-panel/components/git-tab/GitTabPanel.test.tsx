// Modified by The Open Forge contributors.
// @vitest-environment jsdom
/**
 * Git 页签渲染合同：分支与变更列表、干净态、非仓库占位；点击刷新触发重拉。
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const getRepoStatus = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, opts?: { count?: number }) =>
			key === "activityPanel.git.changeCount" ? `${opts?.count} changes` : key,
	}),
}));

import { GitTabPanel } from "./GitTabPanel";

beforeEach(() => {
	getRepoStatus.mockReset();
	// useGitRepoStatus 的模块级缓存按 cwd 键控；每个用例用独立 cwd 避开 TTL 窗口。
	Object.defineProperty(window, "vetta", {
		configurable: true,
		value: { git: { getRepoStatus } },
	});
});

afterEach(() => {
	vi.useRealTimers();
});

it("显示分支与变更列表（状态标签 + 等宽路径）", async () => {
	getRepoStatus.mockResolvedValue({
		branch: "feat/demo",
		head: "",
		changes: [
			{ path: "src/a.ts", status: "modified" },
			{ path: "docs/b.md", status: "added" },
		],
	});
	render(<GitTabPanel cwd="C:/repo/one" />);

	expect(await screen.findByText("feat/demo")).toBeDefined();
	expect(screen.getByText("2 changes")).toBeDefined();
	expect(screen.getByText("src/a.ts")).toBeDefined();
	expect(screen.getByText("activityPanel.git.status.added")).toBeDefined();
});

it("干净工作区显示占位说明", async () => {
	getRepoStatus.mockResolvedValue({ branch: "main", head: "", changes: [] });
	render(<GitTabPanel cwd="C:/repo/clean" />);
	expect(await screen.findByText("activityPanel.git.clean")).toBeDefined();
});

it("非 git 仓库显示占位说明", async () => {
	getRepoStatus.mockResolvedValue(null);
	render(<GitTabPanel cwd="C:/repo/plain" />);
	expect(await screen.findByText("activityPanel.git.notRepo")).toBeDefined();
});

it("点击刷新绕过缓存重拉", async () => {
	const user = userEvent.setup();
	getRepoStatus.mockResolvedValue({ branch: "main", head: "", changes: [] });
	render(<GitTabPanel cwd="C:/repo/two" />);
	await screen.findByText("main");
	expect(getRepoStatus).toHaveBeenCalledTimes(1);
	await user.click(screen.getByTitle("activityPanel.git.refresh"));
	expect(getRepoStatus).toHaveBeenCalledTimes(2);
});
