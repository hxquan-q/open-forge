// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModelSelectorView, type ModelSelectorViewProps } from "@vetta-org/theme-ui/chat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const GROUPS: ModelSelectorViewProps["groups"] = [
	{
		provider: "provider",
		label: "Provider",
		models: [
			{
				key: "provider/alpha",
				provider: "provider",
				modelId: "alpha",
				displayName: "Alpha",
			},
			{
				key: "provider/beta",
				provider: "provider",
				modelId: "beta",
				displayName: "Beta",
			},
		],
	},
];

class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

const labels: ModelSelectorViewProps["labels"] = {
	placeholder: "Choose model",
	searchPlaceholder: "Search models",
	clearSearch: "Clear search",
	noResults: "No models",
	noResultsHint: "Try another query",
	reasoningHeader: "Reasoning",
	modelHeader: "Models",
	cloudOnly: "Cloud",
	visionBadge: "Vision",
	defaultBadge: "Default",
	levelLabel: (value) => value,
};

beforeEach(() => {
	vi.stubGlobal("ResizeObserver", ResizeObserverStub);
	HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("ModelSelectorView", () => {
	it("opens, searches and selects without locking the surrounding document", async () => {
		const user = userEvent.setup();
		const onModelSelect = vi.fn();
		render(
			<ModelSelectorView
				selectedModel="provider/alpha"
				selectedOption={{
					key: "provider/alpha",
					provider: "provider",
					modelId: "alpha",
					displayName: "Alpha",
				}}
				menuLevels={[]}
				groups={[
					{
						provider: "provider",
						label: "Provider",
						models: [
							{
								key: "provider/alpha",
								provider: "provider",
								modelId: "alpha",
								displayName: "Alpha",
							},
							{
								key: "provider/beta",
								provider: "provider",
								modelId: "beta",
								displayName: "Beta",
							},
						],
					},
				]}
				labels={labels}
				onModelSelect={onModelSelect}
				onReasoningSelect={vi.fn()}
			/>,
		);

		const trigger = screen.getByRole("button", { name: "Alpha" });
		await user.click(trigger);

		const search = await screen.findByRole("searchbox", { name: "Search models" });
		await waitFor(() => expect(document.activeElement).toBe(search));
		expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
		expect(document.body.style.pointerEvents).not.toBe("none");

		await user.type(search, "beta");
		expect(screen.queryByRole("menuitem", { name: "Alpha" })).toBeNull();
		await user.click(screen.getByRole("menuitem", { name: "Beta" }));

		expect(onModelSelect).toHaveBeenCalledWith("provider/beta");
		await waitFor(() => expect(screen.queryByRole("searchbox", { name: "Search models" })).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(trigger));
	});

	it("回合进行中：触发器禁用、给出原因，且点不出菜单", async () => {
		const user = userEvent.setup();
		const onModelSelect = vi.fn();
		render(
			<ModelSelectorView
				selectedModel="provider/alpha"
				selectedOption={{ key: "provider/alpha", provider: "provider", modelId: "alpha", displayName: "Alpha" }}
				menuLevels={[]}
				groups={GROUPS}
				labels={{ ...labels, disabledReason: "Available after the current turn finishes" }}
				disabled
				onModelSelect={onModelSelect}
				onReasoningSelect={vi.fn()}
			/>,
		);

		const trigger = screen.getByRole("button", { name: "Alpha" });
		expect(trigger.hasAttribute("disabled")).toBe(true);
		expect(trigger.getAttribute("title")).toBe("Available after the current turn finishes");

		await user.click(trigger);
		fireEvent.click(trigger);
		expect(screen.queryByRole("menuitem", { name: "Beta" })).toBeNull();
		expect(onModelSelect).not.toHaveBeenCalled();
	});

	it("菜单里说明本次选择只影响后续回合", async () => {
		const user = userEvent.setup();
		render(
			<ModelSelectorView
				selectedModel="provider/alpha"
				selectedOption={{ key: "provider/alpha", provider: "provider", modelId: "alpha", displayName: "Alpha" }}
				menuLevels={[]}
				groups={GROUPS}
				labels={{ ...labels, turnScopeHint: "Applies to later turns only" }}
				onModelSelect={vi.fn()}
				onReasoningSelect={vi.fn()}
			/>,
		);

		expect(screen.queryByText("Applies to later turns only")).toBeNull();
		await user.click(screen.getByRole("button", { name: "Alpha" }));
		expect(await screen.findByText("Applies to later turns only")).toBeTruthy();
	});

	it("宿主不提供说明文案时不渲染多余行", async () => {
		const user = userEvent.setup();
		render(
			<ModelSelectorView
				selectedModel="provider/alpha"
				selectedOption={{ key: "provider/alpha", provider: "provider", modelId: "alpha", displayName: "Alpha" }}
				menuLevels={[]}
				groups={GROUPS}
				labels={labels}
				onModelSelect={vi.fn()}
				onReasoningSelect={vi.fn()}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Alpha" }));
		expect(await screen.findByRole("menuitem", { name: "Beta" })).toBeTruthy();
	});
});
