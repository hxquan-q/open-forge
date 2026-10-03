// Modified by The Open Forge contributors.

// @vitest-environment jsdom

import type { ActivityTabKey } from "@shared/lib/project-profile";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityTabDefinition, ResolvedActivityTab } from "../registry/types";
import { useActivityTabResidency } from "./useActivityTabResidency";

function tab(id: string, retention?: ActivityTabDefinition["retention"]): ResolvedActivityTab {
	const definition: ActivityTabDefinition = {
		id,
		source: "builtin",
		useMeta: () => ({ label: id }),
		component: () => null,
		retention,
	};
	return { id, label: id, removable: true, source: "builtin", definition };
}

describe("useActivityTabResidency", () => {
	let activeTab: ActivityTabKey;
	let container: HTMLDivElement;
	let root: Root;
	const candidates = [tab("file"), tab("todo"), tab("debug")];

	function Harness(): ReturnType<typeof createElement> {
		const residentTabs = useActivityTabResidency({
			activeTab,
			candidates,
			floatingKeys: new Set(),
			maxInactiveWarmTabs: 1,
			scopeKey: "C:/repo",
			warmEligibleTabs: candidates,
		});
		return createElement("output", null, residentTabs.map((item) => item.id).join(","));
	}

	beforeEach(() => {
		vi.useFakeTimers();
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		activeTab = "file";
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
		vi.useRealTimers();
	});

	it("keeps visited tabs through the switch and evicts overflow after the fallback delay", () => {
		act(() => root.render(createElement(Harness)));
		expect(container.textContent).toBe("file");

		activeTab = "todo";
		act(() => root.render(createElement(Harness)));
		activeTab = "debug";
		act(() => root.render(createElement(Harness)));
		expect(container.textContent).toBe("file,todo,debug");

		act(() => vi.advanceTimersByTime(250));
		expect(container.textContent).toBe("todo,debug");
	});

	it("evicts the least recently activated pinned tab and rebuilds it when reopened", () => {
		const pinned = [
			tab("plugin:demo:pin-0", "pinned"),
			tab("plugin:demo:pin-1", "pinned"),
			tab("plugin:demo:pin-2", "pinned"),
		];
		function PinnedHarness(): ReturnType<typeof createElement> {
			const residentTabs = useActivityTabResidency({
				activeTab,
				candidates: pinned,
				floatingKeys: new Set(),
				maxInactivePinnedTabs: 2,
				scopeKey: "C:/repo",
				warmEligibleTabs: pinned,
			});
			return createElement("output", null, residentTabs.map((item) => item.id).join(","));
		}

		act(() => root.render(createElement(PinnedHarness)));
		expect(container.textContent).toBe("plugin:demo:pin-1,plugin:demo:pin-2");

		activeTab = "plugin:demo:pin-0";
		act(() => root.render(createElement(PinnedHarness)));
		expect(container.textContent).toBe("plugin:demo:pin-0,plugin:demo:pin-1,plugin:demo:pin-2");

		activeTab = "file";
		act(() => root.render(createElement(PinnedHarness)));
		// pin-0 keeps its newly used position; pin-1 is the one that gives way.
		expect(container.textContent).toBe("plugin:demo:pin-0,plugin:demo:pin-2");
	});
});
