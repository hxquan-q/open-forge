// @vitest-environment jsdom
// Copyright The Open Forge contributors.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PresetProviderRow } from "./PresetProviderRow";
import type {
	PresetProviderRow as PresetProviderRowModel,
	PresetProvidersSectionLabels,
} from "./usePresetProvidersSectionModel";

const labels: PresetProvidersSectionLabels = {
	title: "Preset providers",
	loading: "Loading",
	noPresetProviders: "No providers",
	enabled: "Enabled",
	deprecated: "Deprecated",
	collapseModels: "Collapse models",
	viewModels: "View models",
	modelsCount: (count) => `${count} models`,
	collapse: "Collapse",
	cancel: "Cancel",
	changeKey: "Replace API Key",
	configureApiKey: "Configure API Key",
	remove: "Remove",
	enable: "Enable",
	apiKeyDirect: (provider) => `${provider} API key`,
	apiKeyPlaceholder: "API key",
	encryptedApiKeyPlaceholder: "Saved API key",
	save: "Save",
	noModels: "No models",
	noMatchingModels: "No matching models",
	searchModels: (provider) => `Search ${provider} models`,
	clearModelSearch: "Clear model search",
	modelListLabel: (provider) => `${provider} model list`,
	thinking: "Thinking",
	perMillionTokens: "/M tokens",
	refreshModels: "Refresh models",
	refreshingModels: "Refreshing models",
	refreshCatalog: "Refresh catalog",
	copyApiKey: "Copy API key",
};

function makeRow(overrides: Partial<PresetProviderRowModel> = {}): PresetProviderRowModel {
	return {
		id: "qwen",
		displayName: "Qwen",
		api: "openai-compatible",
		models: [],
		modelRows: [],
		offline: false,
		adopted: false,
		isOpen: false,
		isExpanded: false,
		refreshing: false,
		hasApiKey: false,
		modelsError: null,
		...overrides,
	};
}

const noop = (): void => {};
const noopAsync = async (): Promise<void> => {};

function renderRow(row: PresetProviderRowModel): void {
	render(
		<PresetProviderRow
			row={row}
			draftKey=""
			saving={false}
			labels={labels}
			onToggleExpanded={noop}
			onToggleEditor={noop}
			onDraftKeyChange={noop}
			onAdopt={noopAsync}
			onRemove={noopAsync}
			onRefreshModels={noopAsync}
			onCopyApiKey={noopAsync}
		/>,
	);
}

// 未开 globals,testing-library 的自动清理不会注册:不手动清,后一个用例会撞上前一个留下的 DOM。
afterEach(cleanup);

describe("PresetProviderRow 钥匙按钮", () => {
	it("未启用时提示文案为「配置 API Key」,按钮提升到 icon(32px) 与 h-4 图标", () => {
		renderRow(makeRow());

		const keyButton = screen.getByRole("button", { name: "Configure API Key" });
		expect(keyButton.getAttribute("title")).toBe("Configure API Key");
		expect(keyButton.getAttribute("data-size")).toBe("icon");

		const icon = keyButton.querySelector("span");
		expect(icon?.className).toContain("h-4 w-4");
		expect(icon?.className).toContain("icon-[mdi--key-plus]");
	});

	it("已启用时保持「替换 API Key」,同行刷新/删除按钮一并提升到 icon(32px)", () => {
		renderRow(makeRow({ adopted: true, hasApiKey: true }));

		const keyButton = screen.getByRole("button", { name: "Replace API Key" });
		expect(keyButton.getAttribute("data-size")).toBe("icon");

		const refreshButton = screen.getByTitle("Refresh models");
		expect(refreshButton.getAttribute("data-size")).toBe("icon");
		expect(refreshButton.querySelector("span")?.className).toContain("h-4 w-4");

		const removeButton = screen.getByRole("button", { name: "Remove" });
		expect(removeButton.getAttribute("data-size")).toBe("icon");
		expect(removeButton.querySelector("span")?.className).toContain("h-4 w-4");
	});

	it("编辑态内联按钮(复制/关闭)与主按钮同高,均为 icon(32px)", () => {
		renderRow(makeRow({ adopted: true, hasApiKey: true, isOpen: true }));

		const copyButton = screen.getByRole("button", { name: "Copy API key" });
		expect(copyButton.getAttribute("data-size")).toBe("icon");

		const closeButton = screen.getByRole("button", { name: "Cancel" });
		expect(closeButton.getAttribute("data-size")).toBe("icon");
	});
});
