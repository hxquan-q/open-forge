// Copyright The Open Forge contributors.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export interface ThinkingBlockProps {
	/** 思考原文（纯文本；流式期间持续增长）。 */
	readonly text: string;
	/** 默认是否展开：流式中为 `true`，结束后自动收拢（AC-25）。 */
	readonly defaultOpen: boolean;
}

/**
 * 思考过程折叠块（AC-25）。
 *
 * 与「正式回答」可见地区分：默认态 = 流式中展开、结束后收拢；可手动展开 / 收拢。
 * 自持开合状态，**不 import** open-forge 原版会话域的 ThinkingBlock —— 跨 domain 依赖会触发架构守卫。
 */
export function ThinkingBlock({ text, defaultOpen }: ThinkingBlockProps): JSX.Element {
	const { t } = useTranslation("weknora");
	const [open, setOpen] = useState(defaultOpen);

	// 流式结束（defaultOpen 由 true → false）时自动收拢；用户手动开合不会被反复覆盖。
	useEffect(() => {
		setOpen(defaultOpen);
	}, [defaultOpen]);

	return (
		<div className="mb-2 overflow-hidden rounded-lg border border-border/40 bg-muted/20">
			<button
				type="button"
				aria-expanded={open}
				className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] text-muted-foreground/70 transition-colors hover:text-muted-foreground"
				onClick={() => setOpen((value) => !value)}
			>
				<span
					aria-hidden="true"
					className={`icon-[solar--alt-arrow-down-linear] transition-transform ${open ? "" : "-rotate-90"}`}
				/>
				<span>{t("message.thinking")}</span>
				<span className="ml-auto">{open ? t("message.thinkingHide") : t("message.thinkingShow")}</span>
			</button>
			{open ? (
				<p className="whitespace-pre-wrap break-words border-border/30 border-t px-2.5 py-2 text-[13px] text-muted-foreground">
					{text}
				</p>
			) : null}
		</div>
	);
}
