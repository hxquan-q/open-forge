import { cn } from "@shared/lib/utils";
import { AgentAvatarView } from "@vetta-org/theme-ui/chat";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDurationCompact } from "../../components/blocks/tool-views/shared/format";
import { formatCompactTokens } from "../../components/message-list/MessageTokenUsage";
import type {
	TeamMemberUsage,
	TeamSessionProgress as TeamSessionProgressModel,
	TeamWorkItemPhase,
} from "./team-session-progress";

const PHASE_ICON: Record<TeamSessionProgressModel["phase"], string> = {
	dispatching: "icon-[solar--clipboard-list-linear]",
	running: "icon-[solar--play-circle-linear]",
	waiting: "icon-[solar--pause-circle-linear]",
	attention: "icon-[solar--bell-linear]",
	wrapping: "icon-[solar--flag-linear]",
	settled: "icon-[solar--check-circle-linear]",
};

const STATE_DOT: Record<TeamWorkItemPhase, string> = {
	queued: "bg-muted-foreground/40",
	running: "vetta-live-dot bg-emerald-500",
	waiting: "bg-amber-400",
	attention: "vetta-live-dot bg-amber-400",
	completed: "bg-emerald-500/70",
	failed: "bg-destructive",
	cancelled: "bg-muted-foreground/40",
};

const SUMMARY_ORDER: readonly TeamWorkItemPhase[] = [
	"running",
	"queued",
	"waiting",
	"attention",
	"failed",
	"completed",
	"cancelled",
];

export interface TeamSessionProgressProps {
	readonly progress: TeamSessionProgressModel;
	readonly onOpenMember?: (memberId: string) => void;
}

/**
 * 成员胶囊条下方的会话阶段条：一行说明团队进行到哪一步（分派/执行/等待/收尾），
 * 展开后按成员列出在做的那件任务。事实全部来自快照里的持久化 work item 状态，
 * 组件本身不维护第二套状态机，长按会话期间也不会累积挂载。
 */
export function TeamSessionProgress({ progress, onOpenMember }: TeamSessionProgressProps): JSX.Element {
	const { t } = useTranslation("agent-teams");
	const [expanded, setExpanded] = useState(false);
	const listId = useId();
	const phaseLabel = t(`chat.teamProgress.phase.${progress.phase}`);
	const summary = SUMMARY_ORDER.filter((state) => progress.counts[state] > 0)
		.map((state) => t(`chat.teamProgress.count.${state}`, { count: progress.counts[state] }))
		.join(" · ");
	const highlight =
		progress.phase === "attention" || (progress.phase === "settled" && progress.counts.failed > 0);
	const usageText = (usage: TeamMemberUsage) =>
		t("chat.teamProgress.metrics", {
			rounds: usage.rounds,
			tools: usage.toolCalls,
			input: formatCompactTokens(usage.inputTokens),
			output: formatCompactTokens(usage.outputTokens),
			duration: formatDurationCompact(usage.durationMs),
		});

	return (
		<div
			data-team-session-progress="true"
			role="group"
			aria-label={t("chat.teamProgress.title")}
			className="mx-3 mb-2 shrink-0"
		>
			{/* button 的后代在真实浏览器里是 presentational，live region 必须挂在外面才播报；
			    只报阶段——计数随任务流转频繁变化，全报会刷屏。 */}
			<span role="status" className="sr-only">
				{t("chat.teamProgress.liveStatus", { title: t("chat.teamProgress.title"), phase: phaseLabel })}
			</span>
			<button
				type="button"
				aria-expanded={expanded}
				aria-controls={expanded ? listId : undefined}
				data-team-progress-toggle="true"
				className={cn(
					"flex h-7 w-full items-center gap-2 rounded-lg border border-border/40 bg-muted/40 px-2.5 text-left text-[11px] transition-colors",
					"hover:border-border/60 hover:bg-muted/60 focus-visible:border-ring",
				)}
				onClick={() => setExpanded((value) => !value)}
			>
				<span
					className={cn(
						"h-3.5 w-3.5 shrink-0",
						PHASE_ICON[progress.phase],
						highlight ? "text-destructive" : "text-muted-foreground",
					)}
					aria-hidden="true"
				/>
				<span className="flex min-w-0 flex-1 items-baseline gap-1.5">
					<span className={cn("shrink-0 font-medium", highlight ? "text-destructive" : "text-foreground")}>
						{phaseLabel}
					</span>
					<span className="min-w-0 truncate text-muted-foreground/70">{summary}</span>
				</span>
				<span
					className={cn(
						"h-3 w-3 shrink-0 text-muted-foreground/60",
						expanded ? "icon-[solar--alt-arrow-up-linear]" : "icon-[solar--alt-arrow-down-linear]",
					)}
					aria-hidden="true"
				/>
			</button>
			{expanded ? (
				<div role="list" id={listId} className="mt-1 flex flex-col gap-0.5">
					{progress.rows.map((row) => {
						const stateLabel = row.state
							? t(`chat.teamProgress.item.${row.state}`)
							: t("chat.teamProgress.item.notStarted");
						const metrics = row.usage ? usageText(row.usage) : null;
						const context =
							row.contextPercent !== undefined && row.contextPercent !== null
								? t("chat.teamProgress.context", { percent: Math.round(row.contextPercent) })
								: null;
						const content = (
							<>
								<span className="flex min-w-0 items-center gap-2">
									<span
										className={cn(
											"h-2 w-2 shrink-0 rounded-full",
											row.state ? STATE_DOT[row.state] : "bg-muted-foreground/30",
										)}
										aria-hidden="true"
									/>
									<AgentAvatarView name={row.name} avatar={row.avatar} size="xs" />
									<span className="shrink-0 font-medium text-foreground">
										{row.name}
										{row.isLeader ? (
											<span
												className="icon-[solar--crown-star-bold] ml-1 inline-block h-3 w-3 align-[-2px] text-amber-400"
												title={t("chat.leaderRoute")}
												aria-hidden="true"
											/>
										) : null}
									</span>
									<span className="shrink-0 text-muted-foreground">
										{stateLabel}
										{row.itemCount > 1 ? ` ×${row.itemCount}` : ""}
									</span>
									{row.objective ? (
										<span className="min-w-0 flex-1 truncate text-muted-foreground/60">
											{row.objective}
										</span>
									) : (
										<span className="min-w-0 flex-1" />
									)}
									{row.openable ? (
										<span
											className="icon-[solar--alt-arrow-right-linear] h-3 w-3 shrink-0 text-muted-foreground/50"
											aria-hidden="true"
										/>
									) : null}
								</span>
								{metrics || context ? (
									<span className="truncate pl-4 text-[10px] tabular-nums text-muted-foreground/60">
										{[metrics, context].filter(Boolean).join(" · ")}
									</span>
								) : null}
							</>
						);
						return (
							<div
								key={row.memberId}
								role="listitem"
								data-team-progress-member={row.memberId}
								className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1 text-[11px]"
							>
								{row.openable && onOpenMember ? (
									<button
										type="button"
										title={t("chat.memberSession", { name: row.name })}
										aria-label={t("chat.memberSession", { name: row.name })}
										className="flex w-full min-w-0 flex-col gap-0.5 rounded-md text-left transition-colors hover:bg-accent focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
										onClick={() => onOpenMember(row.memberId)}
									>
										{content}
									</button>
								) : (
									content
								)}
							</div>
						);
					})}
					{progress.totals ? (
						<div
							role="listitem"
							data-team-progress-total="true"
							className="mt-0.5 flex min-w-0 items-center gap-2 border-t border-border/40 px-2 pt-1.5 text-[10px] text-muted-foreground/70"
						>
							<span className="shrink-0 font-medium text-muted-foreground">
								{t("chat.teamProgress.total")}
							</span>
							<span className="min-w-0 truncate tabular-nums">{usageText(progress.totals)}</span>
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}
