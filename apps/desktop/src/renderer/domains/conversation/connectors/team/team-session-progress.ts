import type { TeamSessionActivity } from "@vetta/agent-team";
import type { HistoryEntry } from "@vetta/runtime-core";
import { compactTeamActivityText } from "./teamChatModel";

/** Durable work-item state normalized for display ("attention-required" → "attention"). */
export type TeamWorkItemPhase = "queued" | "running" | "waiting" | "attention" | "completed" | "failed" | "cancelled";

/** Session-level phase projected from the member work items; never a second state machine. */
export type TeamSessionPhase = "dispatching" | "running" | "waiting" | "attention" | "wrapping" | "settled";

/** Read-only usage aggregate over one member's persisted runtime history. */
export interface TeamMemberUsage {
	/** Assistant steps (model calls) the member has taken. */
	readonly rounds: number;
	/** Tool calls issued by the member, including ones still in flight. */
	readonly toolCalls: number;
	readonly inputTokens: number;
	readonly outputTokens: number;
	/** Cumulative busy time: model turn durations plus tool execution durations. */
	readonly durationMs: number;
}

export interface TeamMemberWorkRow {
	readonly memberId: string;
	readonly name: string;
	readonly avatar?: string;
	readonly isLeader: boolean;
	/** Dominant state across this member's work items; absent when nothing was delegated. */
	readonly state?: TeamWorkItemPhase;
	/** Compact preview of the item currently explaining the member's state. */
	readonly objective?: string;
	readonly itemCount: number;
	/** A member session exists and can be opened for live detail. */
	readonly openable: boolean;
	/** Aggregated usage from the member's runtime history; absent when unreadable. */
	readonly usage?: TeamMemberUsage;
	/** Context-window fill for the member's runtime; null when the model does not declare it. */
	readonly contextPercent?: number | null;
}

export interface TeamSessionProgress {
	readonly phase: TeamSessionPhase;
	readonly total: number;
	/** Items that are not in a terminal state. */
	readonly activeCount: number;
	readonly counts: Readonly<Record<TeamWorkItemPhase, number>>;
	readonly rows: readonly TeamMemberWorkRow[];
	/** Session-level usage totals across every member runtime that reported data. */
	readonly totals?: TeamMemberUsage;
}

/** State that decides a member row's headline, in priority order. */
const ROW_PRIORITY: readonly TeamWorkItemPhase[] = ["attention", "running", "waiting", "queued"];

function workItemPhase(state: TeamSessionActivity["state"]): TeamWorkItemPhase {
	return state === "attention-required" ? "attention" : state;
}

function dominantRowState(items: readonly TeamSessionActivity[]): {
	readonly state: TeamWorkItemPhase;
	readonly activity: TeamSessionActivity;
} {
	for (const state of ROW_PRIORITY) {
		const match = items.find((activity) => workItemPhase(activity.state) === state);
		if (match) return { state, activity: match };
	}
	// All terminal: the most recently updated item explains the row.
	const latest = items.reduce((previous, current) => (current.timestamp >= previous.timestamp ? current : previous));
	return { state: workItemPhase(latest.state), activity: latest };
}

/**
 * Project the durable work-item states (snapshot.activities is one entry per work
 * item, state updated in place) into the session-level phase strip. The strip is
 * a pure read model — it owns no state and survives reopening unchanged.
 */
export function projectTeamSessionProgress(input: {
	readonly activities: readonly TeamSessionActivity[];
	readonly members: readonly {
		readonly id: string;
		readonly name: string;
		readonly avatar?: string;
		readonly status: "idle" | "working" | "error";
	}[];
	readonly leaderMemberId?: string;
	readonly memberRuntimeIds?: Readonly<Record<string, string>>;
	/** Leader turn still in flight (pending request or streaming). */
	readonly leaderBusy: boolean;
	/** Per-member usage aggregates projected from each runtime's persisted history. */
	readonly memberUsages?: Readonly<Record<string, TeamMemberUsage | undefined>>;
	/** Context fill per member, keyed by member id; null when the model declares no window. */
	readonly contextPercentByMember?: Readonly<Record<string, number | null>>;
}): TeamSessionProgress | null {
	const { activities, members, leaderMemberId, memberRuntimeIds, leaderBusy, memberUsages, contextPercentByMember } =
		input;
	if (activities.length === 0) return null;

	const counts: Record<TeamWorkItemPhase, number> = {
		queued: 0,
		running: 0,
		waiting: 0,
		attention: 0,
		completed: 0,
		failed: 0,
		cancelled: 0,
	};
	const itemsByMember = new Map<string, TeamSessionActivity[]>();
	for (const activity of activities) {
		const phase = workItemPhase(activity.state);
		counts[phase] += 1;
		const list = itemsByMember.get(activity.targetMemberId);
		if (list) list.push(activity);
		else itemsByMember.set(activity.targetMemberId, [activity]);
	}

	const phase: TeamSessionPhase =
		counts.attention > 0
			? "attention"
			: counts.running > 0
				? "running"
				: counts.queued > 0
					? "dispatching"
					: counts.waiting > 0
						? "waiting"
						: leaderBusy
							? "wrapping"
							: "settled";

	const rows = members.map((member) => {
		const items = itemsByMember.get(member.id);
		const dominant = items && items.length > 0 ? dominantRowState(items) : undefined;
		const usage = memberUsages?.[member.id];
		return {
			memberId: member.id,
			name: member.name,
			...(member.avatar ? { avatar: member.avatar } : {}),
			isLeader: member.id === leaderMemberId,
			...(dominant ? { state: dominant.state } : {}),
			...(dominant ? { objective: compactTeamActivityText(dominant.activity.objective) } : {}),
			itemCount: items?.length ?? 0,
			openable: memberRuntimeIds?.[member.id] !== undefined,
			...(usage ? { usage } : {}),
			...(contextPercentByMember && member.id in contextPercentByMember
				? { contextPercent: contextPercentByMember[member.id] }
				: {}),
		} satisfies TeamMemberWorkRow;
	});

	let totals: TeamMemberUsage | undefined;
	for (const usage of Object.values(memberUsages ?? {})) {
		if (!usage) continue;
		totals = {
			rounds: (totals?.rounds ?? 0) + usage.rounds,
			toolCalls: (totals?.toolCalls ?? 0) + usage.toolCalls,
			inputTokens: (totals?.inputTokens ?? 0) + usage.inputTokens,
			outputTokens: (totals?.outputTokens ?? 0) + usage.outputTokens,
			durationMs: (totals?.durationMs ?? 0) + usage.durationMs,
		};
	}

	return {
		phase,
		total: activities.length,
		activeCount: activities.length - counts.completed - counts.failed - counts.cancelled,
		counts,
		rows,
		...(totals ? { totals } : {}),
	};
}

/**
 * Aggregate one member's persisted runtime history into the budget quadruple.
 * Rounds count assistant steps; tool calls count issued toolCall parts so an
 * in-flight call is visible before its result lands; duration sums model turns
 * plus tool executions as the member's cumulative busy time.
 */
export function projectMemberUsage(history: readonly HistoryEntry[]): TeamMemberUsage {
	let rounds = 0;
	let toolCalls = 0;
	let inputTokens = 0;
	let outputTokens = 0;
	let durationMs = 0;
	for (const entry of history) {
		if (entry.type === "message") {
			const message = entry.message;
			if (message.role === "assistant") {
				rounds += 1;
				inputTokens += message.usage?.input ?? 0;
				outputTokens += message.usage?.output ?? 0;
				toolCalls += message.content.filter((part) => part.type === "toolCall").length;
			}
			continue;
		}
		if (entry.type === "assistant_turn_timing") durationMs += entry.timing.durationMs;
		else if (entry.type === "tool_timing") durationMs += entry.durationMs;
	}
	return { rounds, toolCalls, inputTokens, outputTokens, durationMs };
}
