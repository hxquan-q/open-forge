// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type AgentProfile, createAgentTeamFixture } from "@vetta/agent-team";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewSessionAgentSelector } from "./NewSessionAgentSelector";
import { agentTargetKey, type NewSessionTargetKey, teamTargetKey } from "./target";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, values?: Record<string, unknown>) => {
			if (key === "newSession.agentSelector.memberCount") return `${values?.count ?? 0} members`;
			if (key === "newSession.agentSelector.triggerLabel") return `${values?.label}，${values?.hint}`;
			return key;
		},
	}),
}));

afterEach(cleanup);

describe("NewSessionAgentSelector", () => {
	const document = createAgentTeamFixture();
	const team = document.teams[0];
	const agent = document.agents.find((candidate) => candidate.name === "Researcher");
	if (!team || !agent) throw new Error("missing Agent Team fixture");

	function mockCatalog(next = document): void {
		Object.defineProperty(window, "vetta", {
			configurable: true,
			value: { agentTeams: { list: vi.fn(async () => next) } },
		});
	}

	beforeEach(() => mockCatalog());

	function Harness({ onSelect }: { onSelect: (key: NewSessionTargetKey | null) => void }): JSX.Element {
		const [selectedKey, setSelectedKey] = useState<NewSessionTargetKey | null>(null);
		return (
			<NewSessionAgentSelector
				selectedKey={selectedKey}
				onSelect={(targetKey) => {
					setSelectedKey(targetKey);
					onSelect(targetKey);
				}}
			/>
		);
	}

	it("picks a team from the dialog and turns the trigger into the team's avatar stack", async () => {
		const onSelect = vi.fn();
		const user = userEvent.setup();
		render(<Harness onSelect={onSelect} />);

		const trigger = screen.getByRole("button", { name: /pickTitle/ });
		expect(within(trigger).getByText("newSession.agentSelector.pick")).toBeDefined();
		await user.click(trigger);

		const option = await screen.findByRole("option", { name: new RegExp(team.name) });
		const optionStack = option.querySelector('[data-avatar-stack="true"]');
		expect(optionStack).not.toBeNull();
		expect(optionStack?.querySelectorAll("img")).toHaveLength(3);
		expect(optionStack?.querySelector('[data-avatar-overflow="1"]')).not.toBeNull();

		await user.click(option);
		expect(onSelect).toHaveBeenCalledWith(teamTargetKey(team.id));

		const selectedTrigger = screen.getByRole("button", { name: /switchTitle/ });
		expect(within(selectedTrigger).getByText(team.name)).toBeDefined();
		expect(selectedTrigger.querySelectorAll("img")).toHaveLength(3);
		expect(selectedTrigger.querySelector('[data-avatar-overflow="1"]')).not.toBeNull();
	});

	it("picks a single agent and shows only that agent's avatar on the trigger", async () => {
		const onSelect = vi.fn();
		const user = userEvent.setup();
		render(<Harness onSelect={onSelect} />);

		await user.click(screen.getByRole("button", { name: /pickTitle/ }));

		const option = await screen.findByRole("option", { name: new RegExp(agent.name) });
		await user.click(option);
		expect(onSelect).toHaveBeenCalledWith(agentTargetKey(agent.id));

		const selectedTrigger = screen.getByRole("button", { name: /switchTitle/ });
		expect(within(selectedTrigger).getByText(agent.name)).toBeDefined();
		expect(selectedTrigger.querySelectorAll("img")).toHaveLength(1);
	});

	it("trigger 是唯一交互宿主：头像装饰不再嵌套可聚焦控件（BUG-0039）", () => {
		render(<Harness onSelect={vi.fn()} />);

		const trigger = screen.getByRole("button", { name: /pickTitle/ });
		expect(within(trigger).queryByRole("button")).toBeNull();
	});

	it("trigger 是原生 button，Enter/Space 走默认激活而非手工键盘处理", () => {
		render(<Harness onSelect={vi.fn()} />);

		const trigger = screen.getByRole("button", { name: /pickTitle/ });
		// role="button" 的 div 拿不到原生激活语义（jsdom 之外键盘事件不再合成 click），
		// 这里钉住原生元素合同，而不是断言某个实现细节。
		expect(trigger.tagName).toBe("BUTTON");
	});

	it("trigger 的可访问名包含当前选中项（Label-in-Name：看见的字必须含在读屏名里）", async () => {
		const user = userEvent.setup();
		render(<Harness onSelect={vi.fn()} />);

		// 未选中：可见文案是 pick，描述提示是 pickTitle，两者都要进 accName。
		const trigger = screen.getByRole("button", { name: /pickTitle/ });
		expect(trigger.getAttribute("aria-label")).toContain("newSession.agentSelector.pick");
		expect(trigger.getAttribute("aria-label")).toContain("newSession.agentSelector.pickTitle");

		await user.click(trigger);
		await user.click(await screen.findByRole("option", { name: new RegExp(team.name) }));

		// 选中后：读屏必须先报出选中项的名字，而不是只有「更换…」动作。
		const selectedTrigger = screen.getByRole("button", { name: /switchTitle/ });
		expect(selectedTrigger.getAttribute("aria-label")).toContain(team.name);
	});

	it("splits teams and agents into their own labelled groups", async () => {
		const user = userEvent.setup();
		render(<Harness onSelect={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: /pickTitle/ }));

		const teamsGroup = await screen.findByRole("listbox", { name: "newSession.agentSelector.groupTeams" });
		expect(screen.getByRole("listbox", { name: "newSession.agentSelector.groupAgents" })).toBeDefined();
		// 组名由可见分组标题提供（aria-labelledby），不是复制在 aria-label 里的第二份文案。
		const labelId = teamsGroup.getAttribute("aria-labelledby");
		expect(labelId).toBeTruthy();
		expect(teamsGroup.ownerDocument.getElementById(labelId ?? "")?.textContent).toBe(
			"newSession.agentSelector.groupTeams",
		);
	});

	it("filters both groups with one query and drops a group that matches nothing", async () => {
		const user = userEvent.setup();
		// 搜索框只在条目多到一定数量时出现，预置目录刚好卡在阈值上，故再添一个。
		const extra: AgentProfile = { ...agent, id: "extra-1", name: "Translate" };
		mockCatalog({ ...document, agents: [...document.agents, extra] });
		render(<Harness onSelect={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: /pickTitle/ }));
		await screen.findByRole("option", { name: new RegExp(team.name) });
		await user.type(screen.getByPlaceholderText("newSession.agentSelector.searchPlaceholder"), agent.name);

		expect(screen.queryByRole("listbox", { name: "newSession.agentSelector.groupTeams" })).toBeNull();
		expect(screen.getByRole("listbox", { name: "newSession.agentSelector.groupAgents" })).toBeDefined();
	});

	it("hides team-scoped profile copies so the list shows no shadow duplicates", async () => {
		const user = userEvent.setup();
		const copied: AgentProfile = { ...agent, id: "copy-1", scope: { kind: "team", teamId: team.id } };
		mockCatalog({ ...document, agents: [...document.agents, copied] });
		render(<Harness onSelect={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: /pickTitle/ }));
		await screen.findByRole("option", { name: new RegExp(team.name) });

		// 团队 `copy` 绑定的副本是团队私有的，摆进选择器就是一堆同名条目。
		expect(screen.getAllByRole("option", { name: new RegExp(agent.name) })).toHaveLength(1);
	});
});
