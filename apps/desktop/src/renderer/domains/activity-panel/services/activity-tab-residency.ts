// Modified by The Open Forge contributors.

import type { ActivityTabKey } from "@shared/lib/project-profile";
import type { ActivityTabId, ActivityTabRetention, ResolvedActivityTab } from "../registry/types";

export const DEFAULT_INACTIVE_WARM_TAB_LIMIT = 2;
/**
 * 非活动 pinned 页签的驻留预算。pinned 是插件可对任意数量页签声明的保活策略，
 * 而每个 guest webview 都是独立渲染进程；没有预算时这些进程会随声明无上限累积。
 */
export const DEFAULT_INACTIVE_PINNED_TAB_LIMIT = 3;

export interface ActivityTabResidencyState {
	/** A scope change invalidates every retained component instance. */
	scopeKey: string | null;
	/** Oldest to newest; contains only visited tabs with warm retention. */
	warmLru: readonly ActivityTabId[];
	/**
	 * Oldest to newest pinned tabs. Newly available pinned tabs append, so a small
	 * number of them stays resident without being opened first; the residency set is
	 * derived from the tail, which keeps eviction reversible.
	 */
	pinnedLru: readonly ActivityTabId[];
}

export interface ActivityTabResidencyInput {
	activeTab: ActivityTabKey;
	candidates: readonly ResolvedActivityTab[];
	floatingKeys: ReadonlySet<ActivityTabKey>;
	scopeKey: string | null;
	/** Only attached/on-bar tabs may consume the bounded warm cache. */
	warmEligibleTabs: readonly ResolvedActivityTab[];
}

export function activityTabRetention(tab: ResolvedActivityTab): ActivityTabRetention {
	if (tab.definition.retention) return tab.definition.retention;
	if (tab.definition.keepAliveWhenAvailable === true) return "pinned";
	if (tab.definition.keepAliveWhenAvailable === false) return "active-only";
	return "warm";
}

export function createActivityTabResidencyState(scopeKey: string | null): ActivityTabResidencyState {
	return { scopeKey, warmLru: [], pinnedLru: [] };
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Prune unavailable entries, touch the current warm tab and refresh pinned order. */
export function reconcileActivityTabResidency(
	state: ActivityTabResidencyState,
	input: ActivityTabResidencyInput,
): ActivityTabResidencyState {
	const baseLru = state.scopeKey === input.scopeKey ? state.warmLru : [];
	const candidateById = new Map(input.candidates.map((tab) => [tab.id, tab]));
	const eligibleIds = new Set(input.warmEligibleTabs.map((tab) => tab.id));
	const retained = baseLru.filter((id) => {
		const tab = candidateById.get(id);
		return tab !== undefined && eligibleIds.has(id) && activityTabRetention(tab) === "warm";
	});
	const active = candidateById.get(input.activeTab);
	if (active !== undefined && eligibleIds.has(active.id) && activityTabRetention(active) === "warm") {
		const previousIndex = retained.indexOf(active.id);
		if (previousIndex >= 0) retained.splice(previousIndex, 1);
		retained.push(active.id);
	}
	const pinnedLru = reconcilePinnedLru(state, input, candidateById);
	if (
		state.scopeKey === input.scopeKey &&
		arraysEqual(state.warmLru, retained) &&
		arraysEqual(state.pinnedLru, pinnedLru)
	) {
		return state;
	}
	return { scopeKey: input.scopeKey, warmLru: retained, pinnedLru };
}

/**
 * Pinned tabs accumulate in activation order without being trimmed: the resident set is
 * derived from the tail, so an evicted tab returns to the end as soon as it is opened.
 * Newly available pinned tabs append, which reproduces the previous "registered ⇒
 * resident" behavior for as long as the budget lasts.
 */
function reconcilePinnedLru(
	state: ActivityTabResidencyState,
	input: ActivityTabResidencyInput,
	candidateById: ReadonlyMap<ActivityTabId, ResolvedActivityTab>,
): ActivityTabId[] {
	const base = state.scopeKey === input.scopeKey ? state.pinnedLru : [];
	const ordered = base.filter((id) => {
		const tab = candidateById.get(id);
		return tab !== undefined && activityTabRetention(tab) === "pinned";
	});
	const seen = new Set(ordered);
	for (const tab of input.candidates) {
		if (seen.has(tab.id) || activityTabRetention(tab) !== "pinned") continue;
		seen.add(tab.id);
		ordered.push(tab.id);
	}
	const activeIndex = ordered.indexOf(input.activeTab);
	if (activeIndex >= 0 && activeIndex !== ordered.length - 1) {
		ordered.splice(activeIndex, 1);
		ordered.push(input.activeTab);
	}
	return ordered;
}

export function resolveResidentActivityTabs(
	state: ActivityTabResidencyState,
	input: ActivityTabResidencyInput,
	maxInactivePinnedTabs = DEFAULT_INACTIVE_PINNED_TAB_LIMIT,
): ResolvedActivityTab[] {
	const warmIds = new Set(state.warmLru);
	const pinnedIds = resolveResidentPinnedActivityTabIds(state, input, maxInactivePinnedTabs);
	const eligibleIds = new Set(input.warmEligibleTabs.map((tab) => tab.id));
	return input.candidates.filter((tab) => {
		const id = tab.id as ActivityTabKey;
		if (id === input.activeTab || input.floatingKeys.has(id)) return true;
		const retention = activityTabRetention(tab);
		if (retention === "pinned") return pinnedIds.has(tab.id);
		if (retention === "warm") return eligibleIds.has(tab.id) && warmIds.has(tab.id);
		return false;
	});
}

/**
 * Pinned residency: the most recently activated inactive pinned tabs, plus the active and
 * floating ones. Everything else is evicted, which bounds the number of guest renderer
 * processes a plugin can keep alive; opening an evicted tab rebuilds it from scratch.
 */
export function resolveResidentPinnedActivityTabIds(
	state: ActivityTabResidencyState,
	input: ActivityTabResidencyInput,
	maxInactivePinnedTabs = DEFAULT_INACTIVE_PINNED_TAB_LIMIT,
): Set<ActivityTabId> {
	const protectedIds = new Set<string>([input.activeTab, ...input.floatingKeys]);
	const resident = new Set<ActivityTabId>(protectedIds);
	const inactive = state.pinnedLru.filter((id) => !protectedIds.has(id));
	const budget = Math.max(0, maxInactivePinnedTabs);
	for (const id of inactive.slice(Math.max(0, inactive.length - budget))) resident.add(id);
	return resident;
}

/** Select the oldest inactive warm entries; active/floating tabs never consume the limit. */
export function resolveWarmTabEvictions(
	state: ActivityTabResidencyState,
	input: ActivityTabResidencyInput,
	maxInactiveWarmTabs = DEFAULT_INACTIVE_WARM_TAB_LIMIT,
): ActivityTabId[] {
	const protectedIds = new Set<string>([input.activeTab, ...input.floatingKeys]);
	const inactiveIds = state.warmLru.filter((id) => !protectedIds.has(id));
	return inactiveIds.slice(0, Math.max(0, inactiveIds.length - Math.max(0, maxInactiveWarmTabs)));
}

export function evictWarmActivityTabs(
	state: ActivityTabResidencyState,
	tabIds: readonly ActivityTabId[],
): ActivityTabResidencyState {
	if (tabIds.length === 0) return state;
	const evicted = new Set(tabIds);
	const warmLru = state.warmLru.filter((id) => !evicted.has(id));
	return warmLru.length === state.warmLru.length ? state : { ...state, warmLru };
}
