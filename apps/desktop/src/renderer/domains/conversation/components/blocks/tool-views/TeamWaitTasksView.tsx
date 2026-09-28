import type { ToolCallBlock } from "@shared/store/atoms";
import type { TeamSessionActivity } from "@vetta/agent-team";
import { useTranslation } from "react-i18next";

type TeamWaitItemState = TeamSessionActivity["state"];

export interface TeamWaitTasksSummary {
	readonly reason: "timeout" | "state-changed";
	readonly counts: Readonly<Record<TeamWaitItemState, number>>;
	readonly active: number;
	readonly total: number;
}

const WAIT_ITEM_STATES: readonly TeamWaitItemState[] = [
	"queued",
	"running",
	"waiting",
	"attention-required",
	"completed",
	"failed",
	"cancelled",
];

const TERMINAL_WAIT_STATES: ReadonlySet<TeamWaitItemState> = new Set(["completed", "failed", "cancelled"]);

/**
 * The wait tool serializes its whole result payload; the UI only needs the
 * reason and per-state counts. Anything that does not match that shape returns
 * null so the caller can fall back to neutral wording instead of raw JSON.
 */
export function summarizeTeamWaitTasksResult(result: string | undefined): TeamWaitTasksSummary | null {
	if (result === undefined) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(result);
	} catch {
		return null;
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
	const record = parsed as Record<string, unknown>;
	const reason = record.reason;
	if (reason !== "timeout" && reason !== "state-changed") return null;
	const tasks = Array.isArray(record.tasks) ? record.tasks : [];
	const counts = Object.fromEntries(WAIT_ITEM_STATES.map((state) => [state, 0])) as Record<
		TeamWaitItemState,
		number
	>;
	for (const task of tasks) {
		const state =
			typeof task === "object" && task !== null
				? (task as { workItem?: { state?: unknown } }).workItem?.state
				: undefined;
		if (typeof state === "string" && (WAIT_ITEM_STATES as readonly string[]).includes(state)) {
			counts[state as TeamWaitItemState] += 1;
		}
	}
	const active = tasks.length === 0 ? 0 : tasks.length - counts.completed - counts.failed - counts.cancelled;
	return { reason, counts, active, total: tasks.length };
}

/**
 * team_wait_tasks 的超时结果是结构化 JSON 载荷；对用户它只意味着「成员还在做」。
 * 折叠成一行中性文案，不再原文展示 JSON（等待语义由顶部阶段条与成员卡片承载）。
 */
export function TeamWaitTasksView({ block }: { block: ToolCallBlock }): JSX.Element {
	const { t } = useTranslation("chat");
	const summary = summarizeTeamWaitTasksResult(block.result);
	const text =
		summary === null
			? t("teamWaitTasks.waiting")
			: summary.reason === "timeout"
				? t("teamWaitTasks.timeout", { count: summary.active })
				: `${t("teamWaitTasks.progress")}${
						summary.total > 0
							? `：${WAIT_ITEM_STATES.filter((state) => summary.counts[state] > 0)
									.map((state) => t(`teamWaitTasks.state.${state}`, { count: summary.counts[state] }))
									.join(" · ")}`
							: ""
					}`;
	return (
		<p className="text-[11px] leading-5 text-muted-foreground/70" data-team-wait-tasks="true">
			{text}
		</p>
	);
}
