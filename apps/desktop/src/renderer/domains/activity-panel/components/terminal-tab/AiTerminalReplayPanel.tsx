// Copyright The Open Forge contributors.

import { aiTerminalFeedAtom, type AiTerminalEntry } from "@shared/store/atoms";
import { Spin } from "@vetta-org/ui";
import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

function AiTerminalEntryView({ entry }: { entry: AiTerminalEntry }): JSX.Element {
	const { t } = useTranslation("chat");
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-start gap-1.5">
				<span aria-hidden="true" className="font-mono text-xs text-primary">
					$
				</span>
				<span className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">
					{entry.command}
				</span>
				{entry.running ? (
					<Spin size="sm" label={t("activityPanel.terminal.running")} className="shrink-0" />
				) : null}
			</div>
			{entry.output ? (
				<pre className="overflow-x-auto pl-2.5 font-mono text-xs break-all whitespace-pre-wrap text-muted-foreground">
					{entry.output}
				</pre>
			) : null}
		</div>
	);
}

/**
 * AI 命令回放面板：终端页签的 body（只读投屏）。订阅全局 aiTerminalFeedAtom，
 * 不驱动真 PTY——交互终端仍在底部面板。
 */
export function AiTerminalReplayPanel(): JSX.Element {
	const { t } = useTranslation("chat");
	const feed = useAtomValue(aiTerminalFeedAtom);
	const scrollRef = useRef<HTMLDivElement>(null);

	// feed 更新即贴底：回放的阅读位置是「最新一条命令」，始终跟随到底部。
	useEffect(() => {
		const el = scrollRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [feed]);

	if (feed.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
				<span
					aria-hidden="true"
					className="icon-[solar--command-linear] h-8 w-8 text-muted-foreground/60"
				/>
				<p className="text-xs text-muted-foreground">{t("activityPanel.terminal.empty")}</p>
			</div>
		);
	}

	return (
		<div
			ref={scrollRef}
			role="region"
			aria-label={t("activityPanel.terminal.title")}
			// 不用 role="log"（隐式 aria-live）：live region 会为无障碍通知保留内容
			// 历史，命令流高频更新时该缓存在渲染进程内单调增长，长任务下足以 OOM。
			className="flex h-full flex-col gap-3 overflow-y-auto p-3"
		>
			{feed.map((entry) => (
				<AiTerminalEntryView key={entry.key} entry={entry} />
			))}
		</div>
	);
}
