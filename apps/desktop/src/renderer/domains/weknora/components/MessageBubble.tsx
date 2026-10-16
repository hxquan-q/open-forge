// Copyright The Open Forge contributors.

import { RendererMarkdownContent } from "@shared/components/RendererMarkdownContent";
import { useTranslation } from "react-i18next";
import type { WeKnoraChatMessage, WeKnoraErrorCode } from "../atoms";
import { ThinkingBlock } from "./ThinkingBlock";

/** 错误码 → i18n key（主进程只产 code，中文在渲染层查表，AC-21 / 红线 C4）。 */
const ERROR_KEYS = {
	not_configured: "error.not_configured",
	network: "error.network",
	unauthorized: "error.unauthorized",
	capability_missing: "error.capability_missing",
	tenant_required: "error.tenant_required",
	timeout: "error.timeout",
	stream_error: "error.stream_error",
	stream_interrupted: "error.stream_interrupted",
	unknown: "error.unknown",
} as const satisfies Record<WeKnoraErrorCode, string>;

export interface MessageBubbleProps {
	readonly message: WeKnoraChatMessage;
}

/**
 * 单条消息。
 *
 * 流式期间（`status: "streaming"`）按**纯文本**增量追加；终态（完成 / 取消 / 未完成 / 失败）
 * 才做一次完整 Markdown 渲染 —— 避免逐块解析未闭合语法的抖动（02-plan §4.4 / R5）。
 *
 * AC-25：把思考过程与正式回答**可见地区分**。切分点由解析层在 `complete` 时给出（`answer.promoted`）；
 * 流式期间全文仍是「暂存」状态，先归入思考区（展开），终态才把正式回答铺开、思考区收拢。
 */
export function MessageBubble({ message }: MessageBubbleProps): JSX.Element {
	const { t } = useTranslation("weknora");
	const isUser = message.role === "user";
	const isStreaming = message.status === "streaming";
	// 流式期间：全文暂存为思考，回答区为空；终态：用已切分的 thinking / text（AC-25）。
	const thinkingText = isStreaming ? message.text : message.thinking;
	const answerText = isStreaming ? "" : message.text;

	let statusLabel: string | null = null;
	if (message.status === "cancelled") {
		statusLabel = t("message.cancelled");
	} else if (message.status === "interrupted") {
		statusLabel = t("message.interrupted");
	} else if (message.status === "failed") {
		statusLabel = t(message.errorCode ? ERROR_KEYS[message.errorCode] : "error.unknown", {
			detail: message.errorDetail ?? "",
		});
	}

	return (
		<div className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
			<span className="text-[11px] text-muted-foreground/60">
				{isUser ? t("message.you") : t("message.assistant")}
			</span>
			<div
				className={`max-w-[80%] rounded-xl border border-border/50 px-3.5 py-2.5 text-sm text-foreground ${
					isUser ? "bg-primary/10" : "bg-card/40"
				}`}
			>
				{thinkingText.trim().length > 0 ? <ThinkingBlock defaultOpen={isStreaming} text={thinkingText} /> : null}
				{answerText.length === 0 ? null : isUser || isStreaming ? (
					<p className="whitespace-pre-wrap break-words">{answerText}</p>
				) : (
					<RendererMarkdownContent text={answerText} />
				)}
			</div>
			{statusLabel === null ? null : (
				<span className="text-[11px] text-muted-foreground/60">{statusLabel}</span>
			)}
		</div>
	);
}
