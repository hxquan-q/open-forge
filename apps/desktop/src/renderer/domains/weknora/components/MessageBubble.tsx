// Copyright The Open Forge contributors.

import { RendererMarkdownContent } from "@shared/components/RendererMarkdownContent";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { WeKnoraChatMessage, WeKnoraErrorCode } from "../atoms";
import { stripCitationTags } from "../services/citationTag";
import { ThinkingBlock } from "./ThinkingBlock";
import { ThinkingDots } from "./ThinkingDots";

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
	// T03/AC-5：思考区展示前剥掉 kb/web 标签（完整与残缺；流式暂存与终态思考在此同点覆盖）。
	// 只影响展示，store 原文一字不动（D1）；思考只剩标签时视为空（不渲染空壳思考块）。
	// 用户消息分支显式不处理（不做项：用户自己粘贴的文本尊重原文）。
	const displayThinking = useMemo(
		() => (isUser ? thinkingText : stripCitationTags(thinkingText)),
		[isUser, thinkingText],
	);
	const answerText = isStreaming ? "" : message.text;
	// AC-7/AC-8：助手流式且尚无任何字符（等待首字）时显示三点 + 文案。与 ThinkingBlock 恰好互补
	// （旁白非空走思考块，为空才轮到三点），终态 / 无请求 / 用户消息恒不显示。
	const showThinkingDots = !isUser && isStreaming && displayThinking.trim().length === 0;

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
				{/* AC-4/AC-6：只有本次生成中的助手消息挂逐字动画；用户消息与历史载入恒不挂。 */}
				{displayThinking.trim().length > 0 ? (
					<ThinkingBlock defaultOpen={isStreaming} streaming={isStreaming && !isUser} text={displayThinking} />
				) : null}
				{showThinkingDots ? <ThinkingDots /> : null}
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
