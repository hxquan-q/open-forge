// Copyright The Open Forge contributors.
import { useOpenActivityTab } from "@domains/conversation/hooks/useOpenActivityTab";
import { Button } from "@shared/components/ui/button";
import { type ArtifactCanvasOpenDetails, activeSessionAtom, pendingCanvasArtifactIdAtom } from "@shared/store/atoms";
import { useAtomValue, useSetAtom } from "jotai";
import { createContext, type ReactNode, useContext } from "react";
import { useTranslation } from "react-i18next";

/**
 * 消息列表宿主（Chat / Team 共用的 MessageList）下发的活动工作空间 id。
 * 活动面板页签与 Canvas pending 都按 workspace.id 读写：普通对话是 cwd，Team 是
 * agent-team:<…> 工作空间键。按钮不能再拿 activeSession.cwd 猜——团队会话里那是
 * 上一个普通会话的旧值，页签会写错键，面板永不切换（TASK-0079）。
 */
const ChatActivityWorkspaceIdContext = createContext<string | undefined>(undefined);

export function ChatActivityWorkspaceIdProvider({
	workspaceId,
	children,
}: {
	readonly workspaceId: string | undefined;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		<ChatActivityWorkspaceIdContext.Provider value={workspaceId}>{children}</ChatActivityWorkspaceIdContext.Provider>
	);
}

function useChatActivityWorkspaceId(): string | undefined {
	return useContext(ChatActivityWorkspaceIdContext);
}

export function ArtifactCanvasOpenButton({
	artifact,
}: {
	readonly artifact: ArtifactCanvasOpenDetails;
}): JSX.Element | null {
	const { t } = useTranslation("chat");
	// 优先取宿主下发的聊天工作空间键；MessageList 之外的只读渲染（导出、查看器）
	// 没有上下文，退回 activeSession.cwd——普通对话两者同值，行为不变。
	const scopedWorkspaceId = useChatActivityWorkspaceId();
	const sessionCwd = useAtomValue(activeSessionAtom)?.cwd;
	const workspaceId = scopedWorkspaceId ?? sessionCwd;
	const openActivityTab = useOpenActivityTab(workspaceId);
	const setPending = useSetAtom(pendingCanvasArtifactIdAtom);
	if (!workspaceId) return null;
	return (
		<Button
			type="button"
			variant="outline"
			size="xs"
			className="mt-2"
			onClick={() => {
				// pending 带归属工作空间：只有归属面板会消费，跨面板不再错配。
				setPending({ workspaceId, artifactId: artifact.artifactId });
				openActivityTab("canvas");
			}}
		>
			{t("toolCall.openInCanvas")}
		</Button>
	);
}
