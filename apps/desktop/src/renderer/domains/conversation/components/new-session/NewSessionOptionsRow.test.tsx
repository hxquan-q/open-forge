// @vitest-environment jsdom
/**
 * 选项行在窄插槽下要把项目选择器整枚让出去：留在行里会先把「切换智能体」截成省略号，
 * 再和右锚的装饰件叠在一起。让出去之后，智能体 chip 必须原样还在。
 * 工作区档位切换控件已整体移除（代码模式的入口是侧边栏「Allstar自主开发」版块入口，
 * 新会话默认文档与研究档）——「选项行不复活模式入口」的结构约束由
 * shared/hooks/agent-mode-entry-points.test.ts 守住。
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
			/>
		</Provider>,
	);
}

describe("NewSessionOptionsRow", () => {
	it("showProjectSelector 为 false 时不渲染项目选择器，但智能体 chip 仍在", async () => {
		renderRow(false);

		expect(screen.queryByRole("button", { name: "newSession.projectSelector.triggerTitle" })).toBeNull();
		expect(await screen.findByRole("button", { name: "newSession.agentSelector.pickTitle" })).toBeDefined();
	});

	it("默认：项目选择器接入，且不再有 work/coding 模式切换控件", async () => {
		renderRow(true);

		expect(screen.getByRole("button", { name: "newSession.projectSelector.triggerTitle" })).toBeDefined();
		expect(screen.queryByRole("group", { name: "workspace.mode.switch" })).toBeNull();
		// 档位仍通过底部只读 hint 转述（新会话默认 work 档）。
		expect(screen.getByTestId("new-session-workspace-hint").textContent).toBe("work");
	});
});
