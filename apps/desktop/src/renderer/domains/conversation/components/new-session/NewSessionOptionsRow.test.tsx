// @vitest-environment jsdom
/**
 * 选项行在窄插槽下要把项目选择器整枚让出去：留在行里会先把「切换智能体」截成省略号，
 * 再和右锚的装饰件叠在一起。让出去之后，智能体 chip 必须原样还在。
 * work/coding 切换控件的「唯一入口」从此行进入（页头全局入口已移除），进入对话的会话页
 * 不再展示该控件——结构约束由 shared/hooks/agent-mode-entry-points.test.ts 守住。
 */
import { render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { describe, expect, it, vi } from "vitest";
import { NewSessionOptionsRow } from "./NewSessionOptionsRow";

vi.mock("./project-selector/NewSessionProjectSelector", () => ({
	NewSessionProjectSelector: () => (
		<button type="button">newSession.projectSelector.triggerTitle</button>
	),
}));

vi.mock("./NewSessionAgentSelector", () => ({
	NewSessionAgentSelector: () => <button type="button">newSession.agentSelector.pickTitle</button>,
}));

vi.mock("./NewSessionWorkspaceHint", () => ({
	NewSessionWorkspaceHint: ({ mode }: { mode: string }) => (
		<p data-testid="new-session-workspace-hint">{mode}</p>
	),
}));

const switcherProps = vi.hoisted(() => ({ cwdOverride: undefined as string | null | undefined }));

vi.mock("@domains/workspace-mode", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@domains/workspace-mode")>();
	return {
		...actual,
		WorkspaceModeSwitcher: ({ cwdOverride }: { cwdOverride?: string | null }) => {
			switcherProps.cwdOverride = cwdOverride;
			return (
				<div role="group" aria-label="workspace.mode.switch">
					workspace.mode.switch
				</div>
			);
		},
	};
});

function renderRow(showProjectSelector: boolean): void {
	render(
		<Provider store={createStore()}>
			<NewSessionOptionsRow
				selection={null}
				options={[]}
				takenNames={[]}
				creatingProject={false}
				onSelectProject={vi.fn()}
				onSelectPendingProject={vi.fn()}
				showProjectSelector={showProjectSelector}
				workspaceMode="work"
				workspaceCwd="/repo/session-cwd"
			/>
		</Provider>,
	);
}

describe("NewSessionOptionsRow", () => {
	it("showProjectSelector 为 false 时不渲染项目选择器，但 work/coding 切换仍在", async () => {
		renderRow(false);

		expect(screen.queryByRole("button", { name: "newSession.projectSelector.triggerTitle" })).toBeNull();
		expect(await screen.findByRole("button", { name: "newSession.agentSelector.pickTitle" })).toBeDefined();
		expect(screen.getByRole("group", { name: "workspace.mode.switch" })).toBeDefined();
	});

	it("默认：项目选择器 + work/coding 唯一入口同时接入", async () => {
		renderRow(true);

		expect(screen.getByRole("button", { name: "newSession.projectSelector.triggerTitle" })).toBeDefined();
		expect(screen.getByRole("group", { name: "workspace.mode.switch" })).toBeDefined();
		expect(screen.getByTestId("new-session-workspace-hint").textContent).toBe("work");
	});

	it("把生效的 workspace cwd 下发给切换器，避免高亮与确认句分叉（BUG-0037）", async () => {
		switcherProps.cwdOverride = undefined;
		renderRow(true);

		expect(switcherProps.cwdOverride).toBe("/repo/session-cwd");
	});
});
