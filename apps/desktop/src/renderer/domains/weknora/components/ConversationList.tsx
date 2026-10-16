// Copyright The Open Forge contributors.

import type { WeKnoraAgent, WeKnoraSession } from "@preload/api";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@shared/components/ui/dialog";
import { Button } from "@vetta-org/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { agentNameOfSession, formatSessionTime, type WeKnoraHistoryStatus } from "../atoms";

export interface ConversationListProps {
	readonly sessions: readonly WeKnoraSession[];
	/** 用于把会话的 `last_request_state.agent_id` 映射成 agent 名（AC-20）。 */
	readonly agents: readonly WeKnoraAgent[];
	readonly status: WeKnoraHistoryStatus;
	readonly currentSessionId: string | null;
	readonly loadingSessionId: string | null;
	readonly onNewConversation: () => void;
	readonly onOpenSession: (sessionId: string) => void;
	readonly onReload: () => void;
}

/**
 * 历史会话侧栏（AC-13 / AC-20）。
 *
 * - 「新建对话」清空当前对话（AC-12，由连接层落实，本组件只发信号）。
 * - 每行显示会话标题、绑定的 agent 名（映射不到显示「未知」，AC-20）与更新时间。
 * - **点行不直接切换**：先弹确认（用户 2026-10-16 裁定 1d）——因为打开会替换当前对话；
 *   取消则什么都不做（不切换、不载入），只有确认才回调 `onOpenSession`。
 */
export function ConversationList({
	sessions,
	agents,
	status,
	currentSessionId,
	loadingSessionId,
	onNewConversation,
	onOpenSession,
	onReload,
}: ConversationListProps): JSX.Element {
	const { t } = useTranslation("weknora");
	const [pending, setPending] = useState<WeKnoraSession | null>(null);

	const confirmOpen = (): void => {
		if (pending === null) return;
		const targetId = pending.id;
		setPending(null);
		onOpenSession(targetId);
	};

	return (
		<nav
			aria-label={t("conversation.historyTitle")}
			className="flex w-64 shrink-0 flex-col gap-3 overflow-hidden border-border/40 border-r pr-4"
		>
			<Button className="justify-start" onClick={onNewConversation} size="sm" type="button" variant="outline">
				<span aria-hidden="true" className="icon-[solar--add-circle-linear]" />
				{t("conversation.new")}
			</Button>

			<div className="flex flex-1 flex-col gap-2 overflow-y-auto">
				{status === "loading" ? (
					<p className="px-1 text-[12px] text-muted-foreground/60">{t("conversation.loading")}</p>
				) : null}

				{status === "error" ? (
					<div className="rounded-lg border border-border/50 bg-card/40 p-3">
						<p className="text-[12px] text-foreground">{t("conversation.error")}</p>
						<Button className="mt-2" onClick={onReload} size="sm" type="button" variant="outline">
							{t("conversation.retry")}
						</Button>
					</div>
				) : null}

				{status === "ready" && sessions.length === 0 ? (
					<p className="px-1 text-[12px] text-muted-foreground/60">{t("conversation.empty")}</p>
				) : null}

				<ul className="flex flex-col gap-1">
					{sessions.map((session) => {
						const agentName = agentNameOfSession(agents, session);
						const time = formatSessionTime(session.updated_at ?? session.created_at);
						const isCurrent = session.id === currentSessionId;
						return (
							<li key={session.id}>
								<button
									type="button"
									aria-current={isCurrent ? "true" : undefined}
									className={`flex w-full flex-col gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
										isCurrent ? "border-primary/40 bg-primary/10" : "border-transparent hover:bg-muted/30"
									}`}
									disabled={session.id === loadingSessionId}
									onClick={() => setPending(session)}
								>
									<span className="truncate text-[13px] text-foreground">
										{session.title?.trim() || t("conversation.untitled")}
									</span>
									<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
										<span className="truncate">{agentName ?? t("conversation.unknownAgent")}</span>
										{time ? <span className="ml-auto shrink-0">{time}</span> : null}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			</div>

			<Dialog
				open={pending !== null}
				onOpenChange={(open) => {
					if (!open) setPending(null);
				}}
			>
				<DialogContent className="max-w-[380px]">
					<DialogHeader>
						<DialogTitle>{t("conversation.confirmTitle")}</DialogTitle>
						<DialogDescription>{t("conversation.confirmBody")}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button onClick={() => setPending(null)} type="button" variant="outline">
							{t("conversation.confirmCancel")}
						</Button>
						<Button onClick={confirmOpen} type="button" variant="primary">
							{t("conversation.confirmOk")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</nav>
	);
}
