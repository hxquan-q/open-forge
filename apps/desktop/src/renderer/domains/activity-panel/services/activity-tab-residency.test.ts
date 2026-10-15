// Modified by The Open Forge contributors.

import type { ActivityTabKey } from "@shared/lib/project-profile";
import { describe, expect, it } from "vitest";
import type { ActivityTabDefinition, ActivityTabRetention, ResolvedActivityTab } from "../registry/types";
import {
	type ActivityTabResidencyInput,
	type ActivityTabResidencyState,
	activityTabRetention,
	createActivityTabResidencyState,
	evictWarmActivityTabs,
	reconcileActivityTabResidency,
	resolveResidentActivityTabs,
	resolveWarmTabEvictions,
} from "./activity-tab-residency";

function tab(id: string, options: { keepAlive?: boolean; retention?: ActivityTabRetention } = {}): ResolvedActivityTab {
	const definition: ActivityTabDefinition = {
		id,
		source: "builtin",
		useMeta: () => ({ label: id }),
		component: () => null,
		keepAliveWhenAvailable: options.keepAlive,
		retention: options.retention,
	};
	return {
		id,
		label: id,
		removable: true,
		source: "builtin",
		definition,
	};
}

function input(
	candidates: readonly ResolvedActivityTab[],
	activeTab: ActivityTabKey,
	options: {
		floatingKeys?: ReadonlySet<ActivityTabKey>;
		scopeKey?: string | null;
		warmEligibleTabs?: readonly ResolvedActivityTab[];
	} = {},
): ActivityTabResidencyInput {
	return {
		activeTab,
		candidates,
		floatingKeys: options.floatingKeys ?? new Set(),
		scopeKey: options.scopeKey ?? "C:/repo",
		warmEligibleTabs: options.warmEligibleTabs ?? candidates,
	};
}

describe("activity tab residency", () => {
	it("defaults to warm while preserving legacy keep-alive semantics", () => {
		expect(activityTabRetention(tab("default"))).toBe("warm");
		expect(activityTabRetention(tab("kept", { keepAlive: true }))).toBe("pinned");
		expect(activityTabRetention(tab("ephemeral", { keepAlive: false }))).toBe("active-only");
		expect(activityTabRetention(tab("explicit", { keepAlive: true, retention: "warm" }))).toBe("warm");
	});

	it("keeps visited warm tabs resident and updates their LRU order", () => {
		const candidates = [tab("file"), tab("plugin:content"), tab("todo")];
		let state = reconcileActivityTabResidency(createActivityTabResidencyState("C:/repo"), input(candidates, "file"));
		state = reconcileActivityTabResidency(state, input(candidates, "plugin:content"));
		expect(state.warmLru).toEqual(["file", "plugin:content"]);
		expect(resolveResidentActivityTabs(state, input(candidates, "plugin:content")).map((item) => item.id)).toEqual([
			"file",
			"plugin:content",
		]);

		state = reconcileActivityTabResidency(state, input(candidates, "file"));
		expect(state.warmLru).toEqual(["plugin:content", "file"]);
	});

	it("evicts the oldest inactive warm tab while protecting active and floating tabs", () => {
		const candidates = [tab("file"), tab("todo"), tab("debug"), tab("browser")];
		let state = createActivityTabResidencyState("C:/repo");
		for (const active of ["file", "todo", "debug", "browser"] satisfies ActivityTabKey[]) {
			state = reconcileActivityTabResidency(state, input(candidates, active));
		}
		const currentInput = input(candidates, "browser", {
			floatingKeys: new Set<ActivityTabKey>(["file"]),
		});
		const evictions = resolveWarmTabEvictions(state, currentInput, 1);
		expect(evictions).toEqual(["todo"]);
		expect(evictWarmActivityTabs(state, evictions).warmLru).toEqual(["file", "debug", "browser"]);
	});

	it("mounts pinned tabs eagerly and active-only tabs only while active or floating", () => {
		const candidates = [
			tab("file"),
			tab("browser", { retention: "pinned" }),
			tab("plugin:cheap", { retention: "active-only" }),
		];
		const state = reconcileActivityTabResidency(
			createActivityTabResidencyState("C:/repo"),
			input(candidates, "file"),
		);
		expect(resolveResidentActivityTabs(state, input(candidates, "file")).map((item) => item.id)).toEqual([
			"file",
			"browser",
		]);
		expect(
			resolveResidentActivityTabs(
				state,
				input(candidates, "file", { floatingKeys: new Set<ActivityTabKey>(["plugin:cheap"]) }),
			).map((item) => item.id),
		).toEqual(["file", "browser", "plugin:cheap"]);
	});

	it("bounds pinned residency and restores an evicted pinned tab when it is opened again", () => {
		const candidates = [
			tab("plugin:demo:pin-1", { retention: "pinned" }),
			tab("plugin:demo:pin-2", { retention: "pinned" }),
			tab("plugin:demo:pin-3", { retention: "pinned" }),
			tab("plugin:demo:pin-4", { retention: "pinned" }),
			tab("file"),
		];
		const residentIds = (state: ActivityTabResidencyState, active: ActivityTabKey): string[] =>
			resolveResidentActivityTabs(state, input(candidates, active)).map((item) => item.id);

		let state = reconcileActivityTabResidency(createActivityTabResidencyState("C:/repo"), input(candidates, "file"));
		// Only the most recently registered inactive pinned tabs stay resident; pin-1 gives way.
		expect(residentIds(state, "file")).toEqual([
			"plugin:demo:pin-2",
			"plugin:demo:pin-3",
			"plugin:demo:pin-4",
			"file",
		]);

		state = reconcileActivityTabResidency(state, input(candidates, "plugin:demo:pin-1"));
		state = reconcileActivityTabResidency(state, input(candidates, "file"));
		// Opening the evicted pin-1 puts it back at the most-recently-used end and evicts pin-2.
		expect(residentIds(state, "file")).toEqual([
			"plugin:demo:pin-1",
			"plugin:demo:pin-3",
			"plugin:demo:pin-4",
			"file",
		]);
	});

	it("never evicts the active pinned tab, even when it is the oldest", () => {
		const candidates = [
			tab("plugin:demo:pin-1", { retention: "pinned" }),
			tab("plugin:demo:pin-2", { retention: "pinned" }),
			tab("plugin:demo:pin-3", { retention: "pinned" }),
			tab("plugin:demo:pin-4", { retention: "pinned" }),
		];
		let state = reconcileActivityTabResidency(
			createActivityTabResidencyState("C:/repo"),
			input(candidates, "plugin:demo:pin-1"),
		);
		state = reconcileActivityTabResidency(state, input(candidates, "plugin:demo:pin-2"));

		expect(
			resolveResidentActivityTabs(state, input(candidates, "plugin:demo:pin-1"), 1).map((item) => item.id),
		).toEqual(["plugin:demo:pin-1", "plugin:demo:pin-2"]);
	});

	it("keeps the pinned budget independent from the warm budget", () => {
		const candidates = [
			tab("plugin:demo:pin-1", { retention: "pinned" }),
			tab("plugin:demo:pin-2", { retention: "pinned" }),
			tab("plugin:demo:pin-3", { retention: "pinned" }),
			tab("plugin:demo:pin-4", { retention: "pinned" }),
			tab("file"),
			tab("todo"),
			tab("debug"),
		];
		let state = createActivityTabResidencyState("C:/repo");
		for (const active of ["file", "todo", "debug"] satisfies ActivityTabKey[]) {
			state = reconcileActivityTabResidency(state, input(candidates, active));
		}

		expect(resolveResidentActivityTabs(state, input(candidates, "debug")).map((item) => item.id)).toEqual([
			"plugin:demo:pin-2",
			"plugin:demo:pin-3",
			"plugin:demo:pin-4",
			"file",
			"todo",
			"debug",
		]);
		// Warm keeps its own limit; pinned tabs never consume it.
		expect(resolveWarmTabEvictions(state, input(candidates, "debug"), 1)).toEqual(["file"]);
	});

	it("drops detached tabs and resets warm history when the project scope changes", () => {
		const candidates = [tab("file"), tab("plugin:content")];
		let state = reconcileActivityTabResidency(
			createActivityTabResidencyState("C:/one"),
			input(candidates, "file", { scopeKey: "C:/one" }),
		);
		state = reconcileActivityTabResidency(
			state,
			input(candidates, "plugin:content", { scopeKey: "C:/one", warmEligibleTabs: [candidates[1]] }),
		);
		expect(state.warmLru).toEqual(["plugin:content"]);

		state = reconcileActivityTabResidency(state, input(candidates, "file", { scopeKey: "C:/two" }));
		expect(state).toEqual({ scopeKey: "C:/two", warmLru: ["file"], pinnedLru: [] });
	});
});
