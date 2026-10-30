// Modified by The Open Forge contributors.
import { activeSessionAtom, currentScenarioAtom, mountedActivityWorkspacesAtom } from "@shared/store/atoms";
import { useActiveSessionRuntimeIds } from "@shared/workspace/active-session-runtime";
import { createActivityWorkspace } from "@shared/workspace/activity-workspace";
import { useThemeComponent } from "@vetta-org/theme-sdk";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo } from "react";
import { useActivityPanelModel } from "../hooks/useActivityPanelModel";
import { ActivityTabMetaHost } from "../registry/ActivityTabMetaHost";
import { ActivityPanelContextProvider } from "../registry/context";
import type { ActivityTabDefinition, ActivityTabId, ActivityTabMeta } from "../registry/types";
import { useActivityTabDefinitions } from "../registry/useActivityTabDefinitions";
import { useFollowAiActivity } from "../hooks/useFollowAiActivity";
import { ActivityPanelFrame } from "./activity-panel/ActivityPanelFrame";
import { ActivityPanelView } from "./activity-panel/ActivityPanelView";
import type { ActivityWorkspace } from "@shared/workspace/activity-workspace";
import type { ActivityPanelProps } from "./activity-panel/types";

function ActivityPanelWithMeta({
	cwd,
	workspaceId,
	definitions,
	metaById,
	knowledgeHistory,
	enablePluginTabs,
}: {
	cwd: string | null;
	workspaceId: string;
	definitions: readonly ActivityTabDefinition[];
	metaById: ReadonlyMap<ActivityTabId, ActivityTabMeta | null>;
	knowledgeHistory: boolean;
	enablePluginTabs: boolean;
}): JSX.Element {
	const { actions, model } = useActivityPanelModel({
		cwd,
		workspaceId,
		definitions,
		metaById,
		knowledgeHistory,
	});
	const Frame = useThemeComponent("activity.panelFrame", ActivityPanelFrame);
	return <ActivityPanelView actions={actions} Frame={Frame} model={model} />;
}

export function ActivityPanel(props: ActivityPanelProps): JSX.Element {
	const { enablePluginTabs = true, knowledgeHistory = false, enabledBuiltinTabs, pluginScenario } = props;
	const { workspace } = props;
	const cwd = workspace.cwd;
	// §11.3（REQ-0030）：热追踪默认关闭——host 必须显式声明 coding 语境。
	const hotTracking = props.hotTracking ?? false;

	const definitions = useActivityTabDefinitions({
		enablePluginTabs,
		knowledgeHistory,
		enabledBuiltinTabs,
		pluginScenario,
	});
	// 非 coding 挂载点不显示 AI 终端回放页签（该页签只承载热追踪投屏）。
	const visibleDefinitions = hotTracking
		? definitions
		: definitions.filter((definition) => definition.id !== "terminal");

	const contextValue = useMemo(
		() => ({ workspace, knowledgeHistory, hotTracking }),
		[workspace, knowledgeHistory, hotTracking],
	);
	useMountedActivityWorkspace(workspace);
	// 演示定稿：AI 活动跟随——shell 开跑切终端、编辑文件切文件页、内嵌浏览器会话变化切浏览器。
	useFollowAiActivity(workspace, hotTracking);

	return (
		<ActivityPanelContextProvider value={contextValue}>
			<ActivityTabMetaHost definitions={visibleDefinitions}>
				{(metaById) => (
					<ActivityPanelWithMeta
						cwd={cwd}
						workspaceId={workspace.id}
						definitions={visibleDefinitions}
						metaById={metaById}
						knowledgeHistory={knowledgeHistory}
						enablePluginTabs={enablePluginTabs}
					/>
				)}
			</ActivityTabMetaHost>
		</ActivityPanelContextProvider>
	);
}

/**
 * 登记挂载中的工作空间，供插件 API 把会话 cwd 翻成面板真正使用的工作空间键
 * （普通对话两者同值，Team 不同，见 ADR-0111）。
 */
function useMountedActivityWorkspace(workspace: ActivityWorkspace): void {
	const setMounted = useSetAtom(mountedActivityWorkspacesAtom);
	const { id, cwd } = workspace;
	useEffect(() => {
		const entry = { id, cwd };
		setMounted((previous) => [entry, ...previous.filter((item) => item.id !== id)]);
		return () => setMounted((previous) => previous.filter((item) => item.id !== id));
	}, [id, cwd, setMounted]);
}

/** Conversation-page adapter. The generic panel itself never reads conversation state. */
export function ConversationActivityPanel(): JSX.Element {
	const activeSession = useAtomValue(activeSessionAtom);
	const pluginScenario = useAtomValue(currentScenarioAtom) ?? undefined;
	const runtimeIds = useActiveSessionRuntimeIds();
	const workspace = useMemo(
		() =>
			createActivityWorkspace(
				activeSession?.cwd ?? "conversation:unbound",
				activeSession?.cwd ?? null,
				runtimeIds,
			),
		[activeSession?.cwd, runtimeIds],
	);
	// §11.3：热追踪按会话创建时固化的档位，不随项目偏好联动。
	return (
		<ActivityPanel
			workspace={workspace}
			pluginScenario={pluginScenario}
			hotTracking={activeSession?.capabilityProfile === "coding"}
		/>
	);
}

/** Adapter for non-conversation hosts that intentionally inherit the current plugin scenario. */
export function CurrentScenarioActivityPanel(
	props: Omit<ActivityPanelProps, "pluginScenario">,
): JSX.Element {
	const pluginScenario = useAtomValue(currentScenarioAtom) ?? undefined;
	return <ActivityPanel {...props} pluginScenario={pluginScenario} />;
}
