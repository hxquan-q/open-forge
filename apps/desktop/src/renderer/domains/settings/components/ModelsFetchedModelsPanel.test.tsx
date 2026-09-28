// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { type FetchedModelsPanelModel, ModelsFetchedModelsPanel } from "./ModelsFetchedModelsPanel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

function model(overrides: Partial<FetchedModelsPanelModel> = {}): FetchedModelsPanelModel {
	return {
		config: { providers: { relay: { models: [{ id: "m1" }] } } },
		fetchedModels: { provider: "relay", models: ["m1", "m2", "m3"], selected: [] },
		saving: false,
		onToggleFetchedModel: vi.fn(),
		onSetAllFetchedSelected: vi.fn(),
		onCancelFetchedModels: vi.fn(),
		onApplyFetchedModels: vi.fn(),
		...overrides,
	};
}

function buttonOf(el: HTMLElement | null): HTMLButtonElement {
	expect(el).toBeTruthy();
	return el as HTMLButtonElement;
}

describe("ModelsFetchedModelsPanel", () => {
	it("已在 provider 里的模型禁选并标为已添加，未勾选时添加按钮不可用", () => {
		render(<ModelsFetchedModelsPanel name="relay" model={model()} />);

		expect(buttonOf(screen.getByText("m1").closest("button")).disabled).toBe(true);
		expect(screen.getByText("alreadyAdded")).toBeTruthy();
		expect(buttonOf(screen.getByRole("button", { name: "addSelectedModels" })).disabled).toBe(true);
	});

	it("点击未添加的模型会切换勾选，已添加的点了不生效", async () => {
		const m = model();
		render(<ModelsFetchedModelsPanel name="relay" model={m} />);
		const user = userEvent.setup();

		await user.click(screen.getByText("m2"));
		expect(m.onToggleFetchedModel).toHaveBeenCalledWith("m2");

		await user.click(screen.getByText("m1"));
		expect(m.onToggleFetchedModel).toHaveBeenCalledTimes(1);
	});

	it("还有可添加的模型时显示全选，全部选中后切换为取消全选", async () => {
		const user = userEvent.setup();
		const onSetAllFetchedSelected = vi.fn();
		const { rerender } = render(
			<ModelsFetchedModelsPanel name="relay" model={model({ onSetAllFetchedSelected })} />,
		);

		await user.click(screen.getByRole("button", { name: "selectAllModels" }));
		expect(onSetAllFetchedSelected).toHaveBeenCalledWith(true);

		// 全部可添加项已勾选后，同一位置变成「取消全选」。
		rerender(
			<ModelsFetchedModelsPanel
				name="relay"
				model={model({
					onSetAllFetchedSelected,
					fetchedModels: { provider: "relay", models: ["m1", "m2", "m3"], selected: ["m2", "m3"] },
				})}
			/>,
		);
		await user.click(screen.getByRole("button", { name: "deselectAllModels" }));
		expect(onSetAllFetchedSelected).toHaveBeenLastCalledWith(false);
	});

	it("拉取失败时展示错误原文，不渲染列表与添加按钮", () => {
		render(
			<ModelsFetchedModelsPanel
				name="relay"
				model={model({ fetchedModels: { provider: "relay", models: [], selected: [], error: "接口返回 401" } })}
			/>,
		);

		expect(screen.getByText("接口返回 401")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "addSelectedModels" })).toBeNull();
		expect(screen.queryByRole("button", { name: "cancel" })).toBeTruthy();
	});
});
