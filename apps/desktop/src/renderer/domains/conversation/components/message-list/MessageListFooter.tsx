// Modified by The Open Forge contributors.
import { retryProgressAtom } from "@shared/store/atoms";
import { showToast } from "@shared/store/toast-atoms";
import { MessageListFooter as MessageListFooterPrimitive } from "@vetta-org/theme-ui/chat";
import { useAtomValue } from "jotai";
import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { PluginTurnCardHost } from "../../../plugins/components/PluginTurnCardHost";
import { classifyChatError, type ChatErrorKind } from "../../services/classifyChatError";
import { StreamingIndicator } from "./AssistantMessage";
import { WorkflowFooterItems } from "./WorkflowFooterItems";

export const MessageListFooter = memo(function MessageListFooter({
	isCompacting,
	pendingLabel,
	waiting,
	sessionPath,
	runtimeSessionId,
	interruptedErrorKind,
}: {
	isCompacting: boolean;
	pendingLabel?: string;
	/** Runtime state; true while the live reply has not produced visible content. */
	waiting: boolean;
	/** 持久会话路径：只用于「会话已建立」门控。 */
	sessionPath?: string;
	/** 该会话的 canonical runtime session id；宿主调用必须用它——传持久路径会被判 SESSION_NOT_FOUND。 */
	runtimeSessionId?: string;
	/** 末尾助手消息以可恢复错误收尾时的错误类别；显示「上次回复未完成 [继续]」。 */
	interruptedErrorKind?: ChatErrorKind;
}) {
	const { t } = useTranslation("chat");
	const retryProgress = useAtomValue(retryProgressAtom);
	const retryKind = retryProgress ? classifyChatError(retryProgress.errorMessage) : undefined;
	const retryLabel = retryProgress
		? t("messageList.retryIndicator", {
				attempt: retryProgress.attempt,
				maxAttempts: retryProgress.maxAttempts,
			})
		: null;
	const retryDetail = retryKind
		? t("messageList.retryReason", {
				reason: t(`messageList.errorBlock.kinds.${retryKind}.title`),
			})
		: null;
	const showResumeBar = Boolean(interruptedErrorKind && runtimeSessionId && !retryLabel && !pendingLabel);
	const onResume = useCallback(() => {
		if (!runtimeSessionId) return;
		void window.vetta.session.retry(runtimeSessionId).catch((error: unknown) => {
			console.warn("[MessageListFooter] resume failed", error);
			showToast({ variant: "warning", message: t("messageList.resumeBar.failed") });
		});
	}, [runtimeSessionId, t]);
	return (
		<MessageListFooterPrimitive.Root>
			{showResumeBar && interruptedErrorKind ? (
				<div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
					<span
						className="icon-[mdi--alert-circle-outline] h-3.5 w-3.5 shrink-0 text-amber-500/80"
						aria-hidden
					/>
					<span className="min-w-0 flex-1 truncate text-[12px] text-foreground/80">
						{t("messageList.resumeBar.title", {
							reason: t(`messageList.errorBlock.kinds.${interruptedErrorKind}.title`),
						})}
					</span>
					<button
						type="button"
						onClick={onResume}
						className="inline-flex h-6 shrink-0 items-center rounded px-1.5 text-[12px] font-medium text-foreground/75 transition-colors hover:bg-muted/70 hover:text-foreground"
					>
						{t("messageList.resumeBar.action")}
					</button>
				</div>
			) : null}
			<MessageListFooterPrimitive.Presence>
				{pendingLabel ? (
					<MessageListFooterPrimitive.Pending key="pending" label={pendingLabel} />
				) : null}
				{isCompacting ? (
					<MessageListFooterPrimitive.Compacting
						key="compacting"
						label={t("messageList.compactionIndicator")}
					/>
				) : null}
				{!isCompacting && retryLabel ? (
					<MessageListFooterPrimitive.Retry
						key="retrying"
						label={retryLabel}
						detail={retryDetail}
					/>
				) : null}
			</MessageListFooterPrimitive.Presence>
			{waiting && !pendingLabel && !isCompacting && !retryLabel ? (
				<MessageListFooterPrimitive.Waiting>
					<StreamingIndicator />
				</MessageListFooterPrimitive.Waiting>
			) : null}
			{sessionPath ? <WorkflowFooterItems /> : null}
			<PluginTurnCardHost />
		</MessageListFooterPrimitive.Root>
	);
});
