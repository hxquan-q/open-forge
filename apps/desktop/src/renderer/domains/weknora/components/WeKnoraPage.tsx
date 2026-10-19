// Copyright The Open Forge contributors.

import { useAtom } from "jotai";
import { weKnoraSaveErrorAtom } from "../atoms";
import { useWeKnoraModel } from "../hooks/useWeKnoraModel";
import { WeKnoraPageView } from "./WeKnoraPageView";

/** 「智能客服」页面容器：把视图模型接到纯展示视图上。 */
export function WeKnoraPage(): JSX.Element {
	const model = useWeKnoraModel();
	// ④：保存失败反馈走独立 atom 读取 —— 刻意不进 view model，以保持 ② 的对外 API 形状不变。
	const [saveError] = useAtom(weKnoraSaveErrorAtom);

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
			saveError={saveError}
			saving={model.saving}
			selectedAgentId={model.selectedAgentId}
			sessions={model.sessions}
			sessionsStatus={model.sessionsStatus}
			streamingSessionIds={model.streamingSessionIds}
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
