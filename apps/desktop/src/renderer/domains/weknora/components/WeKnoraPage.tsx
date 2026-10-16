// Copyright The Open Forge contributors.

import { useWeKnoraModel } from "../hooks/useWeKnoraModel";
import { WeKnoraPageView } from "./WeKnoraPageView";

/** 「智能客服」页面容器：把视图模型接到纯展示视图上。 */
export function WeKnoraPage(): JSX.Element {
	const model = useWeKnoraModel();

	return (
		<WeKnoraPageView
			agents={model.agents}
			agentsStatus={model.agentsStatus}
			baseUrl={model.config?.baseUrl ?? ""}
			configured={model.configured}
			hasApiKey={model.config?.hasApiKey ?? false}
			isStreaming={model.isStreaming}
			messages={model.messages}
			saving={model.saving}
			selectedAgentId={model.selectedAgentId}
			onCancel={model.actions.cancel}
			onReloadAgents={model.actions.reloadAgents}
			onSaveSetup={model.actions.saveSetup}
			onSelectAgent={model.actions.selectAgent}
			onSend={model.actions.send}
		/>
	);
}
