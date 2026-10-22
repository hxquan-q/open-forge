// @vitest-environment jsdom
// Copyright The Open Forge contributors.
// 验收直测（flow-tester）：选型面板分组标题行的余额区（AC-2/3/4/5/9/11）。
// 夹具沿用同目录 `ModelSelectorView.test.tsx`（jsdom + ResizeObserver stub + 多 provider 分组）。
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModelSelectorView, type ModelSelectorViewProps } from "@vetta-org/theme-ui/chat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const BALANCE_LABELS = {
	show: "Show balance",
	hide: "Hide balance",
	refresh: "Refresh balance",
} as const;

const GROUPS: ModelSelectorViewProps["groups"] = [
	{
		provider: "alpha",
		label: "Alpha Provider",
		models: [
			{ key: "alpha/alpha-1", provider: "alpha", modelId: "alpha-1", displayName: "Alpha One" },
			{ key: "alpha/alpha-2", provider: "alpha", modelId: "alpha-2", displayName: "Alpha Two" },
		],
	},
	{
		provider: "beta",
		label: "Beta Provider",
		models: [{ key: "beta/beta-1", provider: "beta", modelId: "beta-1", displayName: "Beta One" }],
	},
];

const SELECTED = { key: "alpha/alpha-1", provider: "alpha", modelId: "alpha-1", displayName: "Alpha One" };

const BALANCE_TEXT = "Balance ¥42.50";

function selector(balance?: ModelSelectorViewProps["balance"]): JSX.Element {
	return (
		<ModelSelectorView
			selectedModel={SELECTED.key}
			selectedOption={SELECTED}
			menuLevels={[]}
			groups={GROUPS}
			labels={labels}
			balance={balance}
			onModelSelect={vi.fn()}
			onReasoningSelect={vi.fn()}
		/>
	);
}

function balanceFor(provider: string, overrides: { onRefresh?: () => void } = {}) {
	return {
		provider,
		text: BALANCE_TEXT,
		labels: BALANCE_LABELS,
		onRefresh: overrides.onRefresh ?? vi.fn(),
	};
}

/** 分组标题行：provider label 所在的 header div。 */
function headerFor(label: string): HTMLElement {
	const labelNode = screen.getByText(label);
	const header = labelNode.parentElement;
	if (!header) throw new Error(`找不到 ${label} 的分组标题行`);
	return header;
}

async function openSelector(): Promise<void> {
	const user = userEvent.setup();
	await user.click(screen.getByRole("button", { name: SELECTED.displayName }));
	await screen.findByRole("searchbox", { name: labels.searchPlaceholder });
}

class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

beforeEach(() => {
	vi.stubGlobal("ResizeObserver", ResizeObserverStub);
	HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("AC-2 余额只出现在当前 provider 的分组标题行", () => {
	it("匹配分组有余额区，其他分组标题行无任何余额节点", async () => {
		render(selector(balanceFor("alpha")));
		await openSelector();

		const alphaHeader = headerFor("Alpha Provider");
		const betaHeader = headerFor("Beta Provider");

		expect(within(alphaHeader).getByRole("button", { name: BALANCE_LABELS.show })).toBeTruthy();
		expect(within(betaHeader).queryByRole("button", { name: BALANCE_LABELS.show })).toBeNull();
		expect(within(betaHeader).queryByRole("button", { name: BALANCE_LABELS.hide })).toBeNull();
		expect(within(betaHeader).queryByRole("button", { name: BALANCE_LABELS.refresh })).toBeNull();
		expect(within(betaHeader).queryByText(BALANCE_TEXT)).toBeNull();
		// 整个面板里只有一个余额区（只有一个闭眼按钮）。
		expect(screen.getAllByRole("button", { name: BALANCE_LABELS.show })).toHaveLength(1);
	});
});

describe("AC-3 每次打开都回到隐藏态", () => {
	it("打开即隐藏：只有闭眼按钮，无金额、无刷新", async () => {
		render(selector(balanceFor("alpha")));
		await openSelector();

		expect(within(headerFor("Alpha Provider")).getByRole("button", { name: BALANCE_LABELS.show })).toBeTruthy();
		expect(screen.queryByText(BALANCE_TEXT)).toBeNull();
		expect(screen.queryByRole("button", { name: BALANCE_LABELS.refresh })).toBeNull();
		expect(screen.queryByRole("button", { name: BALANCE_LABELS.hide })).toBeNull();
	});

	it("开 → 揭示 → 关 → 再开：仍为隐藏态（forceMount 不卸载的关键回归）", async () => {
		const user = userEvent.setup();
		render(selector(balanceFor("alpha")));
		await openSelector();

		await user.click(within(headerFor("Alpha Provider")).getByRole("button", { name: BALANCE_LABELS.show }));
		expect(await screen.findByText(BALANCE_TEXT)).toBeTruthy();

		// 关闭面板：内容区 forceMount，组件不卸载。
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("searchbox", { name: labels.searchPlaceholder })).toBeNull());

		// 再打开：揭示状态必须被 handleOpenChange(true) 显式重置。
		await user.click(screen.getByRole("button", { name: SELECTED.displayName }));
		await screen.findByRole("searchbox", { name: labels.searchPlaceholder });

		expect(screen.queryByText(BALANCE_TEXT)).toBeNull();
		expect(screen.queryByRole("button", { name: BALANCE_LABELS.refresh })).toBeNull();
		expect(within(headerFor("Alpha Provider")).getByRole("button", { name: BALANCE_LABELS.show })).toBeTruthy();
	});
});

describe("AC-4 闭眼/睁眼两态往返", () => {
	it("点闭眼 → 金额 + 刷新 + 睁眼；点睁眼 → 回到仅闭眼", async () => {
		const user = userEvent.setup();
		render(selector(balanceFor("alpha")));
		await openSelector();

		const header = headerFor("Alpha Provider");
		await user.click(within(header).getByRole("button", { name: BALANCE_LABELS.show }));

		expect(within(header).getByText(BALANCE_TEXT)).toBeTruthy();
		expect(within(header).getByRole("button", { name: BALANCE_LABELS.refresh })).toBeTruthy();
		const hide = within(header).getByRole("button", { name: BALANCE_LABELS.hide });
		const eyeIcon = hide.querySelector("span");
		expect(eyeIcon?.className).toContain("icon-[solar--eye-linear]");
		expect(within(header).queryByRole("button", { name: BALANCE_LABELS.show })).toBeNull();

		await user.click(hide);

		expect(within(header).queryByText(BALANCE_TEXT)).toBeNull();
		expect(within(header).queryByRole("button", { name: BALANCE_LABELS.refresh })).toBeNull();
		const show = within(header).getByRole("button", { name: BALANCE_LABELS.show });
		expect(show.querySelector("span")?.className).toContain("icon-[solar--eye-closed-linear]");
	});
});

describe("AC-5 刷新只调宿主回调一次且不改变揭示状态", () => {
	it("点刷新 → onRefresh 恰好一次，金额与睁眼仍可见", async () => {
		const user = userEvent.setup();
		const onRefresh = vi.fn();
		render(selector(balanceFor("alpha", { onRefresh })));
		await openSelector();

		const header = headerFor("Alpha Provider");
		await user.click(within(header).getByRole("button", { name: BALANCE_LABELS.show }));
		await user.click(within(header).getByRole("button", { name: BALANCE_LABELS.refresh }));

		expect(onRefresh).toHaveBeenCalledTimes(1);
		expect(within(header).getByText(BALANCE_TEXT)).toBeTruthy();
		expect(within(header).getByRole("button", { name: BALANCE_LABELS.hide })).toBeTruthy();

		await user.click(within(header).getByRole("button", { name: BALANCE_LABELS.refresh }));
		expect(onRefresh).toHaveBeenCalledTimes(2);
	});
});

describe("AC-9 切到其他 provider 后余额归属新分组且回到隐藏态", () => {
	it("balance.provider 变化 → 新区组标题行有隐藏态余额，旧分组无节点", async () => {
		const user = userEvent.setup();
		const { rerender } = render(selector(balanceFor("alpha")));
		await openSelector();

		await user.click(within(headerFor("Alpha Provider")).getByRole("button", { name: BALANCE_LABELS.show }));
		expect(await screen.findByText(BALANCE_TEXT)).toBeTruthy();

		rerender(selector(balanceFor("beta")));

		await waitFor(() => expect(screen.queryByText(BALANCE_TEXT)).toBeNull());
		const betaHeader = headerFor("Beta Provider");
		expect(within(betaHeader).getByRole("button", { name: BALANCE_LABELS.show })).toBeTruthy();
		expect(within(headerFor("Alpha Provider")).queryByRole("button", { name: BALANCE_LABELS.show })).toBeNull();
	});
});

describe("AC-11 纯加法：不传 balance 时渲染与现状一致", () => {
	it("不传 balance → 面板内无闭眼/睁眼/刷新余额按钮，也无余额文本", async () => {
		render(selector(undefined));
		await openSelector();

		expect(screen.queryByRole("button", { name: BALANCE_LABELS.show })).toBeNull();
		expect(screen.queryByRole("button", { name: BALANCE_LABELS.hide })).toBeNull();
		expect(screen.queryByRole("button", { name: BALANCE_LABELS.refresh })).toBeNull();
		expect(screen.queryByText(BALANCE_TEXT)).toBeNull();
		// 模型列表照常可用（新增分支不影响既有内容）。
		expect(screen.getByRole("menuitem", { name: "Beta One" })).toBeTruthy();
	});
});
