// @vitest-environment jsdom
// Copyright The Open Forge contributors.
//
// 独立验收用例(preset-provider-key-button,AC-1~6)。
// 角度与实现者用例不同:夹具用 zh 真文案(而非英文),两态互证;
// 另加 i18n catalog 回归(锁死 enable 键值不被本票污染)与 McpServerRow 消费端回归。
import { cleanup, render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import enSettings from "../../../../shared/i18n/locales/en/settings.json";
import zhSettings from "../../../../shared/i18n/locales/zh/settings.json";
import { McpServerRow } from "./McpServerRow";
import { PresetProviderRow } from "./PresetProviderRow";
import type { McpSettingsModel } from "./useMcpSettingsModel";
import type {
	PresetProviderRow as PresetProviderRowModel,
	PresetProvidersSectionLabels,
} from "./usePresetProvidersSectionModel";

// zh 真文案:两态互证时,"配置 API Key" 与 "替换 API Key" 必须是不同串,否则测不出分支。
const labels: PresetProvidersSectionLabels = {
	title: "预设服务商",
	loading: "加载中",
	noPresetProviders: "无预设服务商",
	enabled: "已启用",
	deprecated: "已下线",
	collapseModels: "收起模型",
	viewModels: "查看模型",
	modelsCount: (count) => `${count} 个模型`,
	collapse: "收起",
	cancel: "取消",
	changeKey: "替换 API Key",
	configureApiKey: "配置 API Key",
	remove: "移除",
	enable: "启用",
	apiKeyDirect: (provider) => `${provider} 的 API Key`,
	apiKeyPlaceholder: "API Key",
	encryptedApiKeyPlaceholder: "已保存的 API Key",
	save: "保存",
	noModels: "无模型",
	noMatchingModels: "无匹配模型",
	searchModels: (provider) => `搜索 ${provider} 模型`,
	clearModelSearch: "清空模型搜索",
	modelListLabel: (provider) => `${provider} 模型列表`,
	thinking: "思考",
	perMillionTokens: "/百万 tokens",
	refreshModels: "刷新模型",
	refreshingModels: "刷新中",
	refreshCatalog: "刷新目录",
	copyApiKey: "复制 API Key",
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

function renderRow(row: PresetProviderRowModel): { container: HTMLElement } {
	return render(
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

/** 取按钮内图标 span(按钮自身无其它 span 子节点)。 */
function iconSpan(button: HTMLElement): Element | null {
	return button.querySelector("span");
}

afterEach(cleanup);

describe("AC-1 钥匙按钮尺寸(32px/16px)", () => {
	it("未启用:按钮 data-size=icon(32px),图标 h-4 w-4(16px),且不再是小号", () => {
		renderRow(makeRow());

		const keyButton = screen.getByRole("button", { name: "配置 API Key" });
		expect(keyButton.getAttribute("data-size")).toBe("icon");
		expect(keyButton.getAttribute("data-size")).not.toBe("icon-sm");

		const icon = iconSpan(keyButton);
		expect(icon?.className).toContain("h-4");
		expect(icon?.className).toContain("w-4");
		expect(icon?.className).not.toContain("h-3.5");
		expect(icon?.className).not.toContain("w-3.5");
		expect(icon?.className).toContain("icon-[mdi--key-plus]");
	});
});

describe("AC-2 两态提示文案互证", () => {
	it("未启用:title 与可访问名同为「配置 API Key」,不是「替换 API Key」也不是「启用」", () => {
		renderRow(makeRow());

		const keyButton = screen.getByRole("button", { name: "配置 API Key" });
		expect(keyButton.getAttribute("title")).toBe("配置 API Key");
		expect(keyButton.getAttribute("aria-label")).toBe("配置 API Key");
		expect(keyButton.getAttribute("title")).not.toBe("替换 API Key");
		expect(keyButton.getAttribute("title")).not.toBe("启用");
	});

	it("已启用:title 与可访问名仍为「替换 API Key」,未被未启用文案串染", () => {
		renderRow(makeRow({ adopted: true, hasApiKey: true }));

		const keyButton = screen.getByRole("button", { name: "替换 API Key" });
		expect(keyButton.getAttribute("title")).toBe("替换 API Key");
		expect(keyButton.getAttribute("aria-label")).toBe("替换 API Key");
		expect(keyButton.getAttribute("title")).not.toBe("配置 API Key");
		expect(screen.queryByRole("button", { name: "配置 API Key" })).toBeNull();

		const icon = iconSpan(keyButton);
		expect(icon?.className).toContain("icon-[mdi--key-outline]");
		expect(icon?.className).toContain("h-4");
	});
});

describe("AC-4 同行按钮一并提升 + 行内布局不破", () => {
	it("非编辑态:刷新/移除按钮同为 icon(32px) 且图标 h-4 w-4", () => {
		const { container } = renderRow(makeRow({ adopted: true, hasApiKey: true }));

		const refreshButton = screen.getByRole("button", { name: "刷新模型" });
		expect(refreshButton.getAttribute("data-size")).toBe("icon");
		expect(iconSpan(refreshButton)?.className).toContain("h-4 w-4");

		const removeButton = screen.getByRole("button", { name: "移除" });
		expect(removeButton.getAttribute("data-size")).toBe("icon");
		expect(iconSpan(removeButton)?.className).toContain("h-4 w-4");

		// 行高仍为 h-8(32px),恰好容纳放大后的按钮。
		expect(container.querySelector(".h-8")).not.toBeNull();
	});

	it("编辑态:复制/关闭按钮同为 icon(32px) 且图标 h-4 w-4;主按钮保持 h-8", () => {
		renderRow(makeRow({ adopted: true, hasApiKey: true, isOpen: true }));

		const copyButton = screen.getByRole("button", { name: "复制 API Key" });
		expect(copyButton.getAttribute("data-size")).toBe("icon");
		expect(iconSpan(copyButton)?.className).toContain("h-4 w-4");

		const closeButton = screen.getByRole("button", { name: "取消" });
		expect(closeButton.getAttribute("data-size")).toBe("icon");
		expect(iconSpan(closeButton)?.className).toContain("h-4 w-4");

		// 已启用态主按钮文案是「保存」,高度不变(h-8)。
		const saveButton = screen.getByRole("button", { name: "保存" });
		expect(saveButton.className).toContain("h-8");
	});
});

describe("AC-5 共享键 enable 未被污染(其它消费端回归)", () => {
	it("编辑器内主按钮(未启用态)仍显示「启用」,不是「配置 API Key」", () => {
		renderRow(makeRow({ isOpen: true }));

		const primaryButton = screen.getByRole("button", { name: "启用" });
		expect(primaryButton.textContent).toBe("启用");
		// 编辑态下非编辑态的钥匙按钮不渲染:证明主按钮的「启用」来自 enable 键,未被 configureApiKey 污染。
		expect(screen.queryByRole("button", { name: "配置 API Key" })).toBeNull();
	});

	it("McpServerRow 开关仍读 enable 键:禁用态可访问名为「启用」,按钮尺寸未放大(icon-sm)", async () => {
		const i18n = createInstance();
		await i18n.init({
			lng: "zh",
			resources: { zh: { settings: zhSettings } },
			defaultNS: "settings",
			initAsync: false,
		});

		const model = {
			config: { mcpServers: { web: { command: "npx", args: ["-y", "x"], displayName: "Web", disabled: true } } },
			oauthAuthByName: {},
			oauthBusyName: null,
			onToggleDisabled: vi.fn(),
			onDeleteServer: vi.fn(),
			onToggleEditServer: vi.fn(),
		} as unknown as McpSettingsModel;

		render(
			<I18nextProvider i18n={i18n}>
				<McpServerRow name="web" model={model} />
			</I18nextProvider>,
		);

		// enable 键值未被本票改动:开关的可访问名仍是「启用」。
		expect(screen.getByLabelText("启用")).toBeTruthy();
		expect(screen.queryByLabelText("配置 API Key")).toBeNull();
		// 该行图标按钮尺寸未随本票放大(仍 28px),证明 AC-4 只作用于预设服务商行。
		expect(screen.getByRole("button", { name: "删除" }).getAttribute("data-size")).toBe("icon-sm");
	});
});

describe("AC-2/AC-3/AC-5 i18n catalog 回归", () => {
	const zh = zhSettings as unknown as Record<string, string>;
	const en = enSettings as unknown as Record<string, string>;

	it("enable 键值保持「启用」/「Enable」,未被本票复用改值", () => {
		expect(zh.enable).toBe("启用");
		expect(en.enable).toBe("Enable");
	});

	it("changeKey 保持「替换 API Key」/「Replace API Key」", () => {
		expect(zh.changeKey).toBe("替换 API Key");
		expect(en.changeKey).toBe("Replace API Key");
	});

	it("新增 configureApiKey 为「配置 API Key」/「Configure API Key」,且与 enable 区分", () => {
		expect(zh.configureApiKey).toBe("配置 API Key");
		expect(en.configureApiKey).toBe("Configure API Key");
		expect(zh.configureApiKey).not.toBe(zh.enable);
		expect(en.configureApiKey).not.toBe(en.enable);
	});
});
