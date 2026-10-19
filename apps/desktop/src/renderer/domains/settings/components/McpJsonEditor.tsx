// Modified by The Open Forge contributors.
import { McpJsonEditorView } from "@vetta-org/theme-ui/settings";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SETTINGS_SECTION } from "../registry";
import type { McpSettingsModel } from "./useMcpSettingsModel";

export function McpJsonEditor({ model }: { model: McpSettingsModel }): JSX.Element {
	const { t } = useTranslation("settings");
	// 配置路径是运行时事实（数据根可被 env 覆盖或从旧品牌根迁移），只向主进程要，不硬编码。
	const [configPath, setConfigPath] = useState("");
	useEffect(() => {
		let alive = true;
		window.vetta.mcp
			.configPath()
			.then((path) => {
				if (alive) setConfigPath(path);
			})
			.catch(() => {
				// 展示性信息，取不到就不显示提示。
			});
		return () => {
			alive = false;
		};
	}, []);
	return (
		<McpJsonEditorView
			section={SETTINGS_SECTION["mcp-json"]}
			jsonText={model.jsonText}
			onJsonTextChange={(value) => {
				model.setJsonText(value);
				model.clearJsonError();
			}}
			jsonError={model.jsonError}
			configPathHint={configPath ? `${t("configFilePath")}: ${configPath}` : ""}
			placeholder='{ "mcpServers": {} }'
			saveLabel={model.saving ? t("saving") : t("save")}
			saving={model.saving}
			onSave={() => void model.onJsonSave()}
		/>
	);
}
