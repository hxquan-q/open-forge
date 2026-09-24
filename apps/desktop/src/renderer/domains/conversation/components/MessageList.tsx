import { PerfSessionSwitchProfiler } from "@shared/lib/perf-session-switch-profiler";
import { activeSessionAtom } from "@shared/store/atoms";
import { RendererMarkdownScope } from "@shared/components/RendererMarkdownScope";
import { useRendererMarkdownModel } from "@shared/hooks/useRendererMarkdownModel";
import { useAtomValue } from "jotai";
import { selectAtom } from "jotai/utils";
import { useMemo } from "react";
import { MessageCardsScope } from "../hooks/useMessageCardsHostModel";
import { useMessageListModel } from "../hooks/useMessageListModel";
import { useMessageListScrollModel } from "../hooks/useMessageListScrollModel";
import { useDeferredMessageEnhancements } from "../hooks/useDeferredMessageEnhancements";
import { ChatActivityWorkspaceIdProvider } from "./blocks/ArtifactCanvasOpenButton";
import { MessageListView, ExportMessageList } from "./message-list/MessageListView";
import type { MessageListProps } from "./message-list/types";
import { MessageExpansionScope } from "./message-list/expansionStore";
import { SubagentCardsScope } from "./message-list/SubagentCardsScope";

export { ExportMessageList };

const INITIAL_DERIVATION_MESSAGE_COUNT = 4;

const activeRuntimeIdAtom = selectAtom(activeSessionAtom, (session) => session?.runtimeId ?? null);
const activeSessionPathAtom = selectAtom(activeSessionAtom, (session) => session?.sessionPath ?? null);

export function MessageList(props: MessageListProps): JSX.Element {
	const activeRuntimeId = useAtomValue(activeRuntimeIdAtom);
	const activeSessionPath = useAtomValue(activeSessionPathAtom);
	const subagentSessionId = props.sessionId && props.sessionId === activeSessionPath ? activeRuntimeId : null;
	const markdown = useRendererMarkdownModel(props.workspace.cwd, true, props.workspace.id);
	const scroll = useMessageListScrollModel({
		isStreaming: props.isStreaming,
		messages: props.messages,
		sessionId: props.sessionId,
		initialTargetKey: props.initialTargetKey,
		onInitialTargetHandled: props.onInitialTargetHandled,
	});
	const deferredContentReady = useDeferredMessageEnhancements(
		props.sessionId ?? null,
		props.messages.length > 0,
	);
	const derivationMessages = useMemo(
		() =>
			deferredContentReady ? props.messages : props.messages.slice(-INITIAL_DERIVATION_MESSAGE_COUNT),
		[deferredContentReady, props.messages],
	);
	const model = useMessageListModel(props, scroll, derivationMessages);
	return (
		<RendererMarkdownScope value={markdown}>
			{/* 把聊天工作空间键下发给消息块（「在画布中打开」按钮）：与右栏活动面板
			    同一个 workspace.id，Team 会话里按钮才能命中 agent-team:<…> 页签键。 */}
			<ChatActivityWorkspaceIdProvider workspaceId={props.workspace.id}>
				<SubagentCardsScope sessionId={subagentSessionId}>
					<MessageCardsScope scope={props.sessionId ?? null} messages={derivationMessages}>
						<MessageExpansionScope scope={props.sessionId ?? null}>
							<PerfSessionSwitchProfiler id={`MessageList:${deferredContentReady ? "deferred-ready" : "tail-first"}`}>
								<MessageListView
									model={model}
									deferredContentReady={deferredContentReady}
									onAbort={props.onAbort}
									sessionId={props.sessionId}
									pendingLabel={props.pendingLabel}
								>
									{props.children}
								</MessageListView>
							</PerfSessionSwitchProfiler>
						</MessageExpansionScope>
					</MessageCardsScope>
				</SubagentCardsScope>
			</ChatActivityWorkspaceIdProvider>
		</RendererMarkdownScope>
	);
}
