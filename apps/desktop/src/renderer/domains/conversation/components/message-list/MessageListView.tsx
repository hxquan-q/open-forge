import { MessageFeed, MessageFeedLayout } from "@vetta-org/theme-ui/chat";
import { useMessageFeedActiveItem } from "@shared/components/message-feed/useMessageFeedActiveItem";
import { PerfMessageScrollProfiler } from "@shared/lib/perf-message-scroll-profiler";
import {
	perfMessageScrollAttach,
	perfMessageScrollEnabled,
	perfMessageScrollRecordItemSize,
	perfMessageScrollRecordRange,
	perfMessageScrollRecordRenderedItems,
	perfMessageScrollRecordTotalHeight,
} from "@shared/lib/perf-message-scroll";
import { useAtomValue } from "jotai";
import { transcriptWindowStateAtom } from "@shared/store/atoms";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import type { ListItem, ListRange, SizeFunction } from "react-virtuoso";
import type { Usage } from "@vetta/ai/protocol";
import { conversationItemRenderKey } from "@shared/conversation";
import { MessageRow } from "./MessageRendering";
import { MessageItem, ModelSwitchBoundary, ExportMessageList } from "./MessageItem";
import { collectAgentUsages } from "./message-list-derived";
import { MessageTimeline } from "./MessageTimeline";
import {
	buildMessageHeightEstimates,
	createMessageItemSizeRecorder,
} from "./message-height-estimates";
import {
	ensureTranscriptItemRestored,
	loadOlderTranscriptPage,
	noteTranscriptViewportRange,
} from "../../services/transcript-window-controller";
import { reportDuplicateConversationKeys } from "../../services/conversation-key-diagnostics";
import type { ChatTimelineItem, MessageListModel, MessageListProps } from "./types";

export { ExportMessageList };

const VIEWPORT_BUFFER = { top: 320, bottom: 80 };

interface VirtualizerIdentityState {
	readonly sessionId: string | null;
	readonly itemIdentity: string;
	readonly generation: number;
}

function messageCollectionIdentity(messages: readonly ChatTimelineItem[]): string {
	const first = messages.at(0);
	const last = messages.at(-1);
	return `${messages.length}:${first ? conversationItemRenderKey(first) : ""}:${last ? conversationItemRenderKey(last) : ""}`;
}

function useMessageVirtualizerKey(
	sessionId: string | null | undefined,
	messages: readonly ChatTimelineItem[],
): number {
	const normalizedSessionId = sessionId ?? null;
	const itemIdentity = messageCollectionIdentity(messages);
	const identityRef = useRef<VirtualizerIdentityState | null>(null);
	const previous = identityRef.current;
	if (previous === null) {
		identityRef.current = { sessionId: normalizedSessionId, itemIdentity, generation: 0 };
		return 0;
	}
	if (previous.sessionId === normalizedSessionId) {
		identityRef.current = { ...previous, itemIdentity };
		return previous.generation;
	}

	// A newly created conversation first has no durable path. Resolving that path must not
	// remount the same visible rows; switching between two actual conversations must reset
	// Virtuoso's index-based size tree so measurements cannot leak across sessions.
	const resolvesPendingSession =
		previous.sessionId === null && normalizedSessionId !== null && previous.itemIdentity === itemIdentity;
	const generation = resolvesPendingSession ? previous.generation : previous.generation + 1;
	identityRef.current = { sessionId: normalizedSessionId, itemIdentity, generation };
	return generation;
}

export function MessageListView({
	model,
	onAbort,
	children,
	deferredContentReady,
	sessionId = null,
	pendingLabel,
}: {
	model: MessageListModel;
	onAbort: MessageListProps["onAbort"];
	children?: ReactNode;
	deferredContentReady: boolean;
	sessionId?: MessageListProps["sessionId"];
	pendingLabel?: MessageListProps["pendingLabel"];
}): JSX.Element {
	const {
		isStreaming,
		messages,
		modelSwitchLabels,
		scroll,
		tailMessageId,
		participantsById,
		participants,
		onTeamMemberOpen,
	} = model;
	const scrollerElement = scroll.scrollerElement;
	const diagnosticsEnabled = perfMessageScrollEnabled();
	// TASK-0050：Virtuoso firstItemIndex 偏移基数；prepend 时窗口态前移它保住锚点。
	// 所有从 Virtuoso 回来的索引（itemContent/rangeChanged/itemsRendered/data-item-index）
	// 都在绝对空间，进入消息层前先减回偏移。
	const indexOffset = useAtomValue(transcriptWindowStateAtom).firstItemIndex;
	const virtualizerKey = useMessageVirtualizerKey(sessionId, messages);
	// 重复渲染键诊断（BUG-0123）：把 React 的通用重复 key 告警换成可定位来源的结构化记录。
	// 只读，仅在有重复时输出。
	useEffect(() => {
		reportDuplicateConversationKeys(sessionId ?? null, messages);
	}, [sessionId, messages]);
	const heightEstimates = useMemo(
		() => buildMessageHeightEstimates(messages, sessionId),
		[messages, sessionId],
	);
	const itemSize = useMemo<SizeFunction>(() => {
		const measure = createMessageItemSizeRecorder(messages, sessionId);
		if (!diagnosticsEnabled) return measure;
		return (element, field) => {
			const measured = measure(element, field);
			if (field !== "offsetHeight") return measured;
			// data-index 是 originalIndex（数组相对）；data-item-index 在 firstItemIndex 开启后是绝对空间。
			const index = Number.parseInt(element.dataset.index ?? "", 10);
			const estimated = Number.isInteger(index) ? heightEstimates[index] : undefined;
			if (estimated !== undefined) perfMessageScrollRecordItemSize(index, estimated, measured);
			return measured;
		};
	}, [diagnosticsEnabled, heightEstimates, messages, sessionId]);
	const activeItem = useMessageFeedActiveItem<ChatTimelineItem>({
		scrollerElement,
		resetKey: sessionId,
		initialIndex: Math.max(0, messages.length - 1),
	});
	useEffect(() => {
		if (!diagnosticsEnabled || !scrollerElement) return;
		return perfMessageScrollAttach(scrollerElement);
	}, [diagnosticsEnabled, scrollerElement]);
	const handleItemsRendered = useCallback(
		(items: ListItem<ChatTimelineItem>[]) => {
			// ListItem.index 是绝对索引；originalIndex 才是数组相对下标。
			const relative = items.map(
				(item) => ({ ...item, index: item.originalIndex ?? item.index - indexOffset }) as ListItem<ChatTimelineItem>,
			);
			activeItem.onItemsRendered(relative);
			if (diagnosticsEnabled) perfMessageScrollRecordRenderedItems(relative);
		},
		[activeItem.onItemsRendered, diagnosticsEnabled, indexOffset],
	);
	const handleRangeChanged = useCallback(
		(range: ListRange) => {
			// TASK-0035：活动窗口（已含 increaseViewportBy 缓冲）驱动占位恢复/降级。
			noteTranscriptViewportRange({
				startIndex: range.startIndex - indexOffset,
				endIndex: range.endIndex - indexOffset,
			});
			if (diagnosticsEnabled) perfMessageScrollRecordRange(range);
		},
		[diagnosticsEnabled, indexOffset],
	);
	const handleStartReached = useCallback(() => {
		void loadOlderTranscriptPage();
	}, []);
	const handleTimelineNavigate = useCallback(
		(index: number) => {
			const target = messages[index];
			// 目录跳转到占位行时先同步恢复，避免目标短暂显示摘要而非完整内容。
			if (target?.kind === "placeholder") ensureTranscriptItemRestored(target.id);
			scroll.scrollToMessage(index);
		},
		[messages, scroll.scrollToMessage],
	);
	const handleTotalListHeightChange = useCallback(
		(height: number) => {
			scroll.onTotalListHeightChange(height);
			if (diagnosticsEnabled) perfMessageScrollRecordTotalHeight(height);
		},
		[diagnosticsEnabled, scroll.onTotalListHeightChange],
	);
	const lastUserMessageId = useMemo(() => {
		for (let index = messages.length - 1; index >= 0; index--) {
			const message = messages[index];
			if (message.kind === "user") return message.id;
		}
		return null;
	}, [messages]);
	const sessionUsagesRef = useRef<readonly Usage[]>([]);
	sessionUsagesRef.current = useMemo<readonly Usage[]>(
		() => collectAgentUsages(deferredContentReady ? messages : messages.slice(-4), sessionUsagesRef.current),
		[deferredContentReady, messages],
	);
	const itemContent = useCallback(
		(index: number, message: ChatTimelineItem) => {
			return (
				<MessageRow message={message} isLast={index === messages.length - 1}>
					{modelSwitchLabels.has(message.id) && (
						<ModelSwitchBoundary label={modelSwitchLabels.get(message.id) as string} />
					)}
					<MessageItem
						message={message}
						isTailMessage={message.id === tailMessageId}
						isStreaming={isStreaming}
						isLastUserMessage={message.id === lastUserMessageId}
						onAbortEdit={onAbort}
						participant={message.kind === "agent" ? participantsById.get(message.authorId) : undefined}
						pendingLabel={message.kind === "agent" && message.phase === "pending" ? pendingLabel : undefined}
						participants={participants}
						sessionUsages={message.kind === "agent" ? sessionUsagesRef.current : undefined}
						onTeamMemberOpen={onTeamMemberOpen}
					/>
				</MessageRow>
			);
		},
		[
			isStreaming,
			lastUserMessageId,
			messages.length,
			modelSwitchLabels,
			onAbort,
			pendingLabel,
			tailMessageId,
			onTeamMemberOpen,
			participants,
			participantsById,
		],
	);

	return (
		<>
			<MessageFeed.Root>
				<MessageFeedLayout.Frame asChild>
					<div data-message-viewport="stable">
						<MessageFeedLayout.Viewport>
							<PerfMessageScrollProfiler>
								<MessageFeedLayout.Virtualizer asChild>
									<MessageFeed.VirtualList
										key={virtualizerKey}
										virtuosoRef={scroll.virtuosoRef}
										restoreStateFrom={scroll.restoreStateFrom}
										scrollerRef={scroll.scrollerRef}
										items={messages}
										getKey={conversationItemRenderKey}
										atBottomStateChange={scroll.onAtBottomChange}
										totalListHeightChanged={handleTotalListHeightChange}
										followOutput={scroll.followOutput}
										atBottomThreshold={80}
										itemsRendered={handleItemsRendered}
										rangeChanged={handleRangeChanged}
										startReached={handleStartReached}
										firstItemIndex={indexOffset}
										overscan={0}
										increaseViewportBy={VIEWPORT_BUFFER}
										heightEstimates={heightEstimates}
										itemSize={itemSize}
										initialTopMostItemIndex={scroll.initialTopMostItemIndex}
									>
										{(message, index) => itemContent(index - indexOffset, message)}
									</MessageFeed.VirtualList>
								</MessageFeedLayout.Virtualizer>
							</PerfMessageScrollProfiler>
						</MessageFeedLayout.Viewport>
						<MessageFeed.Footer>
							<div className="pb-16">{children}</div>
						</MessageFeed.Footer>
						{/* 悬浮在会话区域左缘，不占消息列宽度；窄于 52rem 时消息列铺满整个会话区，
						    目录会压住气泡，直接整条隐藏。 */}
						{deferredContentReady ? <MessageFeedLayout.LeftRail>
							<MessageFeedLayout.RailContent>
								<MessageTimeline
									key={sessionId ?? "message-timeline"}
									activeMessageIndex={activeItem.activeIndex}
									messages={messages}
									onNavigate={handleTimelineNavigate}
								/>
							</MessageFeedLayout.RailContent>
						</MessageFeedLayout.LeftRail> : null}
					</div>
				</MessageFeedLayout.Frame>
			</MessageFeed.Root>
		</>
	);
}
