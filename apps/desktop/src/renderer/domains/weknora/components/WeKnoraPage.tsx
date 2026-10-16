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
			currentSessionId={model.currentSessionId}
			hasApiKey={model.config?.hasApiKey ?? false}
			isStreaming={model.isStreaming}
			loadingSessionId={model.loadingSessionId}
			messages={model.messages}
			saving={model.saving}
			selectedAgentId={model.selectedAgentId}
			sessions={model.sessions}
			sessionsStatus={model.sessionsStatus}
			onCancel={model.actions.cancel}
			onNewConversation={model.actions.newConversation}
			onOpenSession={model.actions.openSession}
			onReloadAgents={model.actions.reloadAgents}
			onReloadSessions={model.actions.reloadSessions}
			onSaveSetup={model.actions.saveSetup}
			onSelectAgent={model.actions.selectAgent}
			onSend={model.actions.send}
		/>
	);
}
