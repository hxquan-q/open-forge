// Modified by The Open Forge contributors.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsPageShellView } from "@vetta-org/theme-ui/settings";
import { SettingsAiAssist } from "../ai-assist";
import { ModelTransportSettingsSection } from "./ModelTransportSettingsSection";
import { ModelsProvidersSection } from "./ModelsProvidersSection";
import { PresetProvidersSection } from "./PresetProvidersSection";
import type { ModelTransportSettingsModel } from "./useModelTransportSettingsModel";
import type { ModelsSettingsModel } from "./useModelsSettingsModel";

export function ModelsSettingsView({
	model,
	transport,
}: {
	model: ModelsSettingsModel;
	transport: ModelTransportSettingsModel;
}): JSX.Element {
	const { t } = useTranslation("settings");
	// 配置路径是运行时事实（数据根可被 env 覆盖或从旧品牌根迁移），只向主进程要，不硬编码。
	const [configPath, setConfigPath] = useState<string | null>(null);
	useEffect(() => {
		let alive = true;
		window.vetta.models
			.configPath()
			.then((path) => {
				if (alive) setConfigPath(path);
			})
			.catch(() => {
				// 展示性信息，取不到就不显示页脚。
			});
		return () => {
			alive = false;
		};
	}, []);

	return (
		<SettingsPageShellView
			title={model.config ? t("modelSettings.title") : t("modelsTitle")}
			headerAction={model.config ? <SettingsAiAssist tabId="models" /> : undefined}
			loading={!model.config}
			loadingLabel={t("loading")}
			footer={
				model.config && configPath ? (
					<div className="mt-6 break-all text-center text-[11px] text-muted-foreground/60">
						{t("configFilePath")}: {configPath}
					</div>
				) : undefined
			}
		>
			{model.config && (
				<>
					<ModelTransportSettingsSection model={transport} />
					<PresetProvidersSection config={model.config} saveConfig={model.saveConfig} />
					<ModelsProvidersSection model={model} />
				</>
			)}
		</SettingsPageShellView>
	);
}
