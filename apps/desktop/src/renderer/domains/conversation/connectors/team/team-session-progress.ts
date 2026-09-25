import type { TeamSessionActivity } from "@vetta/agent-team";
import { compactTeamActivityText } from "./teamChatModel";

/** Durable work-item state normalized for display ("attention-required" → "attention"). */
export type TeamWorkItemPhase = "queued" | "running" | "waiting" | "attention" | "completed" | "failed" | "cancelled";

/** Session-level phase projected from the member work items; never a second state machine. */
export type TeamSessionPhase = "dispatching" | "running" | "waiting" | "attention" | "wrapping" | "settled";

export interface TeamMemberWorkRow {
	readonly memberId: string;
	readonly name: string;
	readonly avatar?: string;
	readonly isLeader: boolean;
	/** Dominant state across this member's work items. */
	readonly state: TeamWorkItemPhase;
	/** Compact preview of the item currently explaining the member's state. */
	readonly objective?: string;
	readonly itemCount: number;
	/** A member session exists and can be opened for live detail. */
	readonly openable: boolean;
}

export interface TeamSessionProgress {
	readonly phase: TeamSessionPhase;
	readonly total: number;
	/** Items that are not in a terminal state. */
	readonly activeCount: number;
	readonly counts: Readonly<Record<TeamWorkItemPhase, number>>;
	readonly rows: readonly TeamMemberWorkRow[];
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
}): TeamSessionProgress | null {
	const { activities, members, leaderMemberId, memberRuntimeIds, leaderBusy } = input;
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

	const rows = members.flatMap((member) => {
		const items = itemsByMember.get(member.id);
		if (!items || items.length === 0) return [];
		const dominant = dominantRowState(items);
		return [
			{
				memberId: member.id,
				name: member.name,
				...(member.avatar ? { avatar: member.avatar } : {}),
				isLeader: member.id === leaderMemberId,
				state: dominant.state,
				objective: compactTeamActivityText(dominant.activity.objective),
				itemCount: items.length,
				openable: memberRuntimeIds?.[member.id] !== undefined,
			} satisfies TeamMemberWorkRow,
		];
	});

	return {
		phase,
		total: activities.length,
		activeCount: activities.length - counts.completed - counts.failed - counts.cancelled,
		counts,
		rows,
	};
}
