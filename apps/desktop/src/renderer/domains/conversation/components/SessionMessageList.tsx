// Modified by The Open Forge contributors.
import { activeSessionAtom, isCompactingAtom, pendingScrollToEntryAtom } from "@shared/store/atoms";
import { getQueueForSession, messageQueueBySessionAtom } from "@shared/store/message-queue-atoms";
import { useAtom, useAtomValue } from "jotai";
import { createContext, useCallback, useContext, useMemo } from "react";
import { SessionSelection } from "./message-list/SessionSelection";
import type { ConversationUserMessageViewModel } from "@shared/conversation";
import { AnnotationScope } from "./annotations/AnnotationScope";
import { AnnotationMessageMarker } from "./annotations/AnnotationMenus";
import { MessageList } from "./MessageList";
import { MessageListFooter } from "./message-list/MessageListFooter";
import { MessageRenderingDefaults, DefaultMessageRow } from "./message-list/MessageRendering";
import type { MessageRowProps } from "./message-list/MessageRendering";
import { ForkOriginBanner, resolveForkOriginPlacement } from "./message-list/ForkOriginBanner";
import type { MessageRendering } from "./message-list/MessageRendering";
import { SessionUserMessage } from "./message-list/SessionUserMessage";
import { SuggestionBubbles } from "./SuggestionBubbles";
import type { MessageListProps } from "./message-list/types";
import { resolveInterruptedErrorKind } from "../services/interrupted-resume";

const sessionRendering: MessageRendering = {
	row: SessionMessageRow,
	renderers: {
		user: (props) =>
			props.message.kind === "user" ? <SessionUserMessage {...props} message={props.message} /> : null,
	},
};

const ForkContext = createContext<{ anchorId?: string; source?: ConversationUserMessageViewModel }>({});
function SessionMessageRow(props: MessageRowProps) {
	const fork = useContext(ForkContext);
	const showFork = fork.anchorId === props.message.id;
	return (
		<DefaultMessageRow {...props} isLast={props.isLast && !showFork}>
			<div className="group/annotation relative">
				{props.children}
				{props.message.kind === "agent" ? (
					<div className="pointer-events-none absolute right-0 top-0 opacity-0 group-hover/annotation:pointer-events-auto group-hover/annotation:opacity-100 group-focus-within/annotation:pointer-events-auto group-focus-within/annotation:opacity-100">
						<AnnotationMessageMarker message={props.message} />
					</div>
				) : null}
			</div>
			{showFork ? <ForkOriginBanner sourceMessage={fork.source} /> : null}
		</DefaultMessageRow>
	);
}

/** Ordinary-session recipe. Other feeds do not inherit its commands or runtime state. */
export function SessionMessageList(props: MessageListProps & { onSend?: (overrideText?: string) => Promise<void> }) {
	const session = useAtomValue(activeSessionAtom);
	const isCompacting = useAtomValue(isCompactingAtom);
	const [pendingTarget, setPendingTarget] = useAtom(pendingScrollToEntryAtom);
	const clearPendingTarget = useCallback(() => setPendingTarget(null), [setPendingTarget]);
	const fork = useMemo(() => {
		const placement = resolveForkOriginPlacement(
			props.messages,
			session?.parentEntryId,
			Boolean(session?.parentSessionPath),
		);
		const source = placement ? props.messages[placement.sourceUserIndex] : undefined;
		return {
			anchorId: placement ? props.messages[placement.anchorIndex]?.id : undefined,
			source: source?.kind === "user" ? source : undefined,
		};
	}, [props.messages, session?.parentEntryId, session?.parentSessionPath]);
	// 宿主调用只认本 feed 自己的会话：active session 换成别的会话时（切换在途的中间态），
	// 绝不能把别的会话的 runtimeId 交给续跑条——那会重启错会话的回合。与下方 AnnotationScope 同一守卫。
	const resumeRuntimeSessionId =
		session && session.sessionPath === props.sessionId ? session.runtimeId : undefined;
	// 排队输入待派发期间渲染端的 streaming 信念会短暂为假，但内核仍会拒绝续跑
	// （BUG-0122）；队列镜像即主进程真值，据此在排队期间不提供续跑入口。
	const queueBySession = useAtomValue(messageQueueBySessionAtom);
	const hasPendingQueue = getQueueForSession(queueBySession, resumeRuntimeSessionId).length > 0;
	const interruptedErrorKind = useMemo(
		() =>
			resolveInterruptedErrorKind(props.messages, {
				isStreaming: props.isStreaming,
				isCompacting,
				hasPendingQueue,
			}),
		[props.messages, props.isStreaming, isCompacting, hasPendingQueue],
	);
	const feed = (
		<ForkContext.Provider value={fork}>
			<MessageRenderingDefaults value={sessionRendering}>
				<SessionSelection>
					<MessageList
						{...props}
						initialTargetKey={pendingTarget?.entryId}
						onInitialTargetHandled={clearPendingTarget}
					>
						<MessageListFooter
							isCompacting={isCompacting}
							waiting={props.isStreaming && props.messages.at(-1)?.kind !== "agent"}
							sessionPath={props.sessionId ?? undefined}
							runtimeSessionId={resumeRuntimeSessionId}
							pendingLabel={props.pendingLabel}
							interruptedErrorKind={interruptedErrorKind}
						/>
						{props.onSend ? <SuggestionBubbles onSend={props.onSend} /> : null}
						{props.children}
					</MessageList>
				</SessionSelection>
			</MessageRenderingDefaults>
		</ForkContext.Provider>
	);
	// Feed 身份以持久会话路径为准；runtimeId 只用于宿主调用。批注作用域常驻包裹：
	// 会话就绪只点亮按会话重置的面板，绝不重挂下面的消息列表。
	return (
		<AnnotationScope
			session={session && session.sessionPath === props.sessionId ? session : null}
			sourceEntryIds={props.messages.flatMap((message) => (message.entryId ? [message.entryId] : []))}
		>
			{feed}
		</AnnotationScope>
	);
}
