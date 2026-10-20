import type { ConversationParticipantViewModel } from "@shared/conversation";
import type { ChatConversationItem, ChatTimelineItem } from "@shared/store/atoms";
import type { ActivityWorkspace } from "@shared/workspace/activity-workspace";
import type { ReactNode } from "react";
import type { MessageListScrollModel } from "../../hooks/useMessageListScrollModel";
import type { AssistantFoldData, BlockSegment } from "./messageBlockModel";
import type { WorkSegment } from "./progressGroupModel";

export type { ChatConversationItem, ChatTimelineItem };

export interface MessageListProps {
	messages: readonly ChatTimelineItem[];
	isStreaming: boolean;
	workspace: ActivityWorkspace;
	sessionId?: string | null;
	initialTargetKey?: string | null;
	onInitialTargetHandled?: () => void;
	pendingLabel?: string;
	onAbort?: () => void;
	participants?: readonly ConversationParticipantViewModel[];
	children?: ReactNode;
	onTeamMemberOpen?: (memberId: string) => void;
}

export interface MessageListModel {
	isStreaming: boolean;
	messages: readonly ChatTimelineItem[];
	modelSwitchLabels: Map<string, string>;
	scroll: MessageListScrollModel;
	tailMessageId: string | null;
	participantsById: ReadonlyMap<string, ConversationParticipantViewModel>;
	participants: readonly ConversationParticipantViewModel[];
	onTeamMemberOpen?: MessageListProps["onTeamMemberOpen"];
}

export interface AssistantMessageModel {
	conclusionText: string;
	exportProcessSegments: BlockSegment[];
	foldData: AssistantFoldData | null;
	isCurrentlyStreaming: boolean;
	isPredicting: boolean;
	/** 仍在追加的 thinking block id：原位改用实时滚动卡片渲染。 */
	liveThinkingId: string | null;
	segments: WorkSegment[];
	processSegments?: WorkSegment[];
	answerSegments?: WorkSegment[];
	/** 折叠条的计数单位是阶段数，而非原始 block 数。 */
	workFoldCount: number;
	durationAvailable: boolean;
	streamingTailIndex: number;
}
