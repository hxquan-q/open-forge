// Copyright The Open Forge contributors.
// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModelsSettingsView } from "./ModelsSettingsView";
import type { ModelTransportSettingsModel } from "./useModelTransportSettingsModel";
import type { ModelsSettingsModel } from "./useModelsSettingsModel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
// 页脚路径断言不依赖各分区内容，mock 掉以保持用例聚焦。
vi.mock("./ModelTransportSettingsSection", () => ({ ModelTransportSettingsSection: () => null }));
vi.mock("./ModelsProvidersSection", () => ({ ModelsProvidersSection: () => null }));
vi.mock("./PresetProvidersSection", () => ({ PresetProvidersSection: () => null }));
vi.mock("../ai-assist", () => ({ SettingsAiAssist: () => null }));
vi.mock("@vetta-org/theme-ui/settings", () => ({
	SettingsPageShellView: ({ footer, children }: { footer?: React.ReactNode; children?: React.ReactNode }) => (
		<div>
			{children}
			{footer}
		</div>
	),
}));

const CONFIG_PATH = "C:\\Users\\someone\\.openforge\\agent\\models.json";

function installConfigPath(path: string): void {
	(window as unknown as { vetta: unknown }).vetta = {
		models: { configPath: vi.fn(async () => path) },
	};
}

const model = { config: { providers: {} } } as unknown as ModelsSettingsModel;
const transport = {} as ModelTransportSettingsModel;

describe("ModelsSettingsView 配置路径页脚", () => {
	it("页脚显示主进程返回的运行时路径，而非硬编码的旧品牌数据根", async () => {
		installConfigPath(CONFIG_PATH);
		render(<ModelsSettingsView model={model} transport={transport} />);

		await waitFor(() => expect(screen.getByText(`configFilePath: ${CONFIG_PATH}`)).toBeTruthy());
		expect(screen.queryByText(/~\/\.vetta/)).toBeNull();
	});

	it("路径未就绪或获取失败时不渲染页脚，不回退到任何硬编码路径", () => {
		(window as unknown as { vetta: unknown }).vetta = {
			models: { configPath: vi.fn(async () => "later") },
		};
		render(<ModelsSettingsView model={model} transport={transport} />);

		// 首帧尚未 resolve：页脚不出现（也不出现旧路径）。
		expect(screen.queryByText(/configFilePath/)).toBeNull();
	});
});
