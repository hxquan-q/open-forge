// Modified by The Open Forge contributors.
import { useThemeComponent } from "@vetta-org/theme-sdk";
import { DiagnosticsExportDialogView } from "./DiagnosticsExportDialogView";
import { useDiagnosticsExportDialogModel } from "./useDiagnosticsExportDialogModel";

/** 设置 › 通用 › 导出诊断包：说明包里有什么，引导用户把它发给开发者（GitHub Issue 或私聊）。 */
export function DiagnosticsExportDialog(): JSX.Element {
	const model = useDiagnosticsExportDialogModel();
	const ThemedDiagnosticsExportDialogView = useThemeComponent(
		"root.diagnosticsExportDialogView",
		DiagnosticsExportDialogView,
	);
	return <ThemedDiagnosticsExportDialogView {...model} />;
}
