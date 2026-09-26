// @vitest-environment jsdom

import type { AgentBlueprint, AgentProfile } from "@vetta/agent-team";
import type { ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentProfileEditInput } from "../hooks/useAgentLibraryModel";
import type { AgentCapabilityOption } from "../lib/capability-options";
import { AgentProfileSheet } from "./AgentProfileSheet";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) =>
			`${key}${options?.name ?? options?.plugin ?? options?.count ?? options?.index ?? ""}`,
		i18n: { language: "zh" },
	}),
}));
vi.mock("@vetta-org/ui", () => ({
	Button: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => (
		<button {...props}>{children}</button>
	),
	cn: (...values: readonly unknown[]) => values.filter(Boolean).join(" "),
	Input: (props: Record<string, unknown>) => <input {...props} />,
	Switch: ({
		checked,
		onCheckedChange,
		...props
	}: {
		checked: boolean;
		onCheckedChange: () => void;
	} & Record<string, unknown>) => (
		<button type="button" role="switch" aria-checked={checked} onClick={onCheckedChange} {...props} />
	),
}));
vi.mock("react-virtuoso", () => ({
	GroupedVirtuoso: ({
		groupCounts,
		groupContent,
		itemContent,
	}: {
		groupCounts: readonly number[];
		groupContent: (index: number) => ReactNode;
		itemContent: (index: number) => ReactNode;
	}) => (
		<div>
			{groupCounts.map((count, groupIndex) => (
				<div key={groupIndex}>
					{groupContent(groupIndex)}
					{Array.from({ length: count }, (_, itemIndex) => {
						const offset = groupCounts.slice(0, groupIndex).reduce((sum, value) => sum + value, 0);
						return <div key={itemIndex}>{itemContent(offset + itemIndex)}</div>;
					})}
				</div>
			))}
		</div>
	),
}));
vi.mock("@vetta-org/theme-ui/chat", () => ({
	AgentAvatarView: () => <span />,
}));
vi.mock("@vetta-org/theme-ui/overlays", () => ({
	DetailDrawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
		open ? <div>{children}</div> : null,
	DetailDrawerEnter: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("../abilities/components/AbilityIcon", () => ({ AbilityIcon: () => <span /> }));

const blueprint: AgentBlueprint = {
	id: "preset-agent",
	nameKey: "",
	descriptionKey: "",
	name: "General agent",
	systemPrompt: "You are a general agent.",
	defaultAbilities: { selectionMode: "all", skills: [], mcpServers: [], plugins: [] },
};

const capabilities: readonly AgentCapabilityOption[] = [
	{
		id: "research",
		kind: "skill",
		title: "Research",
		description: "Find evidence",
		enabledGlobally: true,
	},
	{
		id: "notion",
		kind: "mcp",
		title: "Notion",
		description: "Read pages",
		enabledGlobally: true,
	},
];

function createdWith(input: AgentProfileEditInput): AgentProfile {
	return {
		id: "agent-new",
		revision: 1,
		name: input.name,
		description: input.description,
		mentionHandle: input.mentionHandle,
		blueprintId: blueprint.id,
		abilities: input.abilities,
		scope: { kind: "library" },
		createdAt: 0,
		updatedAt: 0,
	};
}

function renderCreateSheet(onCreate: (input: AgentProfileEditInput) => Promise<AgentProfile | undefined>) {
	return render(
		<AgentProfileSheet
			open
			mode="create"
			blueprints={[blueprint]}
			capabilities={capabilities}
			onClose={vi.fn()}
			onSaved={vi.fn()}
			onPreview={vi.fn()}
			onSave={vi.fn()}
			onCreate={onCreate}
		/>,
	);
}

afterEach(cleanup);

describe("AgentProfileSheet create mode", () => {
	it("persists the blueprint default abilities when the user saves without opening the abilities tab", async () => {
		const user = userEvent.setup();
		const onCreate = vi.fn(async (input: AgentProfileEditInput) => createdWith(input));
		renderCreateSheet(onCreate);

		await user.type(screen.getByLabelText("profile.name"), "Scout");
		await user.click(screen.getByRole("button", { name: "center.confirmCreate" }));

		await waitFor(() =>
			expect(onCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "Scout",
					abilities: expect.objectContaining({ selectionMode: "all" }),
				}),
			),
		);
	});

	it("persists a custom selection once the user disables a capability", async () => {
		const user = userEvent.setup();
		const onCreate = vi.fn(async (input: AgentProfileEditInput) => createdWith(input));
		renderCreateSheet(onCreate);

		await user.click(screen.getByRole("tab", { name: /center\.tabAbilities/ }));
		await user.click(screen.getByRole("switch", { name: "profile.toggleAbilityResearch" }));
		await user.click(screen.getByRole("button", { name: "center.confirmCreate" }));

		await waitFor(() =>
			expect(onCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					abilities: expect.objectContaining({
						selectionMode: "custom",
						skills: [],
						mcpServers: ["notion"],
					}),
				}),
			),
		);
	});
});
