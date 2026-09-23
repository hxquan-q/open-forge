// @vitest-environment jsdom
/**
 * 选项行在窄插槽下要把项目选择器整枚让出去：留在行里会先把「切换智能体」截成省略号，
 * 再和右锚的装饰件叠在一起。让出去之后，智能体 chip 必须原样还在。
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
			/>
		</Provider>,
	);
}

describe("NewSessionOptionsRow", () => {
	it("showProjectSelector 为 false 时不渲染项目选择器", async () => {
		renderRow(false);

		expect(screen.queryByRole("button", { name: "agentMode.work" })).toBeNull();
		expect(screen.queryByRole("button", { name: "newSession.projectSelector.triggerTitle" })).toBeNull();
		expect(await screen.findByRole("button", { name: "newSession.agentSelector.pickTitle" })).toBeDefined();
	});

	it("默认仍把项目选择器留在行里，且不再放第二套工作/编程开关", async () => {
		renderRow(true);

		expect(screen.queryByRole("button", { name: "agentMode.work" })).toBeNull();
		expect(screen.getByRole("button", { name: "newSession.projectSelector.triggerTitle" })).toBeDefined();
	});
});
