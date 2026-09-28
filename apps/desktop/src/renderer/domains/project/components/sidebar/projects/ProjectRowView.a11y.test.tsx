// @vitest-environment jsdom
/**
 * 项目行左侧的图标按钮只画一个图标：没有可访问名称时读屏用户听到的是无名按钮
 * （axe `button-name`，critical，BUG-0039）。名称由宿主经 `toggleTitle` 下发。
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectRowView } from "@vetta-org/theme-ui/project";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

function renderRow(expanded: boolean) {
	const actions = { collapse: vi.fn(), expand: vi.fn(), navigate: vi.fn(), newSession: vi.fn() };
	render(
		<ProjectRowView
			displayName="demo"
			expanded={expanded}
			hasRunning={false}
			isActive={false}
			newSessionTitle="新会话"
			projectCwd="C:\\work\\demo"
			projectType="normal"
			toggleTitle="展开或折叠「demo」的会话"
			onCollapse={actions.collapse}
			onExpand={actions.expand}
			onNavigateProject={actions.navigate}
			onNewSession={actions.newSession}
			onOpenContextMenu={vi.fn()}
		/>,
	);
	return actions;
}

describe("ProjectRowView 图标按钮的可访问名称", () => {
	it("以 toggleTitle 作为名称，折叠态点击仍展开并导航", async () => {
		const actions = renderRow(false);

		const toggle = screen.getByRole("button", { name: "展开或折叠「demo」的会话" });
		await userEvent.setup().click(toggle);

		expect(actions.expand).toHaveBeenCalledTimes(1);
		expect(actions.navigate).toHaveBeenCalledTimes(1);
	});

	it("展开态点击只折叠，不重复导航", async () => {
		const actions = renderRow(true);

		await userEvent.setup().click(screen.getByRole("button", { name: "展开或折叠「demo」的会话" }));

		expect(actions.collapse).toHaveBeenCalledTimes(1);
		expect(actions.navigate).not.toHaveBeenCalled();
	});
});
