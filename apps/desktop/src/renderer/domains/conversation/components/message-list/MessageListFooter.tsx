// Modified by The Open Forge contributors.
import { retryProgressAtom } from "@shared/store/atoms";
import { showToast } from "@shared/store/toast-atoms";
import { MessageListFooter as MessageListFooterPrimitive } from "@vetta-org/theme-ui/chat";
import { useAtomValue } from "jotai";
import { memo, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PluginTurnCardHost } from "../../../plugins/components/PluginTurnCardHost";
import { classifyChatError, type ChatErrorKind } from "../../services/classifyChatError";
import { classifyResumeFailure } from "../../services/resume-failure";
import { StreamingIndicator } from "./AssistantMessage";
import { WorkflowFooterItems } from "./WorkflowFooterItems";

/** 内核拒绝续跑时的专属文案 key；未归类失败的通用文案走 `failed`。 */
function resumeFailureMessageKey(error: unknown): ResumeBarMessageKey {
	switch (classifyResumeFailure(error)) {
		case "busy":
			return "messageList.resumeBar.busy";
		case "recovery_required":
			return "messageList.resumeBar.recoveryRequired";
		default:
			return "messageList.resumeBar.failed";
	}
}

type ResumeBarMessageKey =
	| "messageList.resumeBar.busy"
	| "messageList.resumeBar.recoveryRequired"
	| "messageList.resumeBar.failed";

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
	// 在途点击锁：宿主调用未 settle 前禁用按钮，重复点击不再发出第二次 retry
	// （内核忙碌时每次点击都会被 SESSION_BUSY 拒绝，见 BUG-0122）。用 ref 做同步守卫，
	// 不依赖 state 重渲染落地——同一帧内的连点也必须被挡住。
	const [resuming, setResuming] = useState(false);
	const resumingRef = useRef(false);
	const onResume = useCallback(() => {
		if (!runtimeSessionId || resumingRef.current) return;
		resumingRef.current = true;
		setResuming(true);
		void window.vetta.session
			.retry(runtimeSessionId)
			.catch((error: unknown) => {
				console.warn("[MessageListFooter] resume failed", error);
				showToast({ variant: "warning", message: t(resumeFailureMessageKey(error)) });
			})
			.finally(() => {
				resumingRef.current = false;
				setResuming(false);
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
						disabled={resuming}
						aria-busy={resuming}
						className="inline-flex h-6 shrink-0 items-center rounded px-1.5 text-[12px] font-medium text-foreground/75 transition-colors hover:bg-muted/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
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
