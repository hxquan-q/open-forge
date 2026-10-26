// Modified by The Open Forge contributors.
import { useAtomValue, useSetAtom } from "jotai";
import { memo, useCallback, useEffect, useMemo } from "react";
import {
	activeSessionAtom,
	pageHeaderLeftSlotAtom,
	pageHeaderRightSlotAtom,
	type WorkspaceMode,
} from "@shared/store/atoms";
import { useActiveSessionRuntimeIds } from "@shared/workspace/active-session-runtime";
import { createActivityWorkspace } from "@shared/workspace/activity-workspace";
import { useWorkspaceMode } from "@domains/workspace-mode";
import { useBoundAgentParticipants } from "../hooks/useBoundAgentParticipants";
import { useChatViewModel } from "../hooks/useChatViewModel";
import { ChatHeaderActionsView } from "./chat-view/ChatHeaderActionsView";
import { ChatHeaderNewSessionButton } from "./chat-view/ChatHeaderNewSessionButton";
import { DefaultChatView, ChatComposer } from "./chat-view/DefaultChatView";
import { SessionMessageList } from "./SessionMessageList";
import { SessionAssistantRendering } from "./SessionAssistantRendering";
import { DefaultInputBarConnector } from "./input-bar/DefaultInputBarConnector";
import type { ChatViewProps } from "./chat-view/types";

const SessionFeed = memo(SessionMessageList);

export const DefaultChatComposer = memo(function DefaultChatComposer({
	onSend,
	onAbort,
	onSendQueued,
	cwdOverride,
}: ChatViewProps): JSX.Element {
	return (
		<ChatComposer>
			<DefaultInputBarConnector
				onSend={onSend}
				onAbort={onAbort}
				onSendQueued={onSendQueued}
				cwdOverride={cwdOverride}
			/>
		</ChatComposer>
	);
});

export function ChatView(props: ChatViewProps): JSX.Element {
	const { actions, model } = useChatViewModel();
	const { mode: projectMode } = useWorkspaceMode(model.cwd);
	const activeSession = useAtomValue(activeSessionAtom);
	// 右栏布局跟随会话自身的工具面（capabilityProfile 创建时固化）；项目档位只决定新会话
	// 页的默认档。若仍按项目档位取值，进入「Allstar自主开发」版块（档位=coding）后，同一
	// 项目的已有研究会话右栏会被翻成执行面板。折叠口径与 main 侧一致：profile 缺失/未知按
	// coding（旧会话维持现状的执行面板）；无活动会话时回落项目档位。
	const workspaceMode: WorkspaceMode = activeSession
		? activeSession.capabilityProfile === "work"
			? "work"
			: "coding"
		: projectMode;
	const participants = useBoundAgentParticipants();
	const runtimeIds = useActiveSessionRuntimeIds();
	const setHeaderRightSlot = useSetAtom(pageHeaderRightSlotAtom);
	const setHeaderLeftSlot = useSetAtom(pageHeaderLeftSlotAtom);
	const headerActions = useMemo(
		() => <ChatHeaderActionsView actions={actions} model={model.header} />,
		[actions, model.header],
	);
	const workspace = useMemo(
		() =>
			createActivityWorkspace(
				model.cwd ?? model.sessionId ?? "conversation:unbound",
				model.cwd,
				runtimeIds,
			),
		[model.cwd, model.sessionId, runtimeIds],
	);
	const onAbort = useCallback(() => {
		void props.onAbort();
	}, [props.onAbort]);

	useEffect(() => {
		setHeaderRightSlot(headerActions);
		return () => setHeaderRightSlot(null);
	}, [headerActions, setHeaderRightSlot]);

	useEffect(() => {
		setHeaderLeftSlot(<ChatHeaderNewSessionButton />);
		return () => setHeaderLeftSlot(null);
	}, [setHeaderLeftSlot]);

	return (
		<DefaultChatView
			messages={model.messages}
			workspace={workspace}
			workspaceMode={workspaceMode}
			rootClassName={model.rootClassName}
			exportState={model.exporting ? { title: model.exportTitle, onFinished: actions.finishExport } : undefined}
		>
			<SessionAssistantRendering>
				<SessionFeed
					messages={model.messages}
					workspace={workspace}
					isStreaming={model.isStreaming}
					sessionId={model.sessionId}
					participants={participants}
					onSend={props.onSend}
					onAbort={onAbort}
				/>
			</SessionAssistantRendering>
			<DefaultChatComposer {...props} />
		</DefaultChatView>
	);
}
