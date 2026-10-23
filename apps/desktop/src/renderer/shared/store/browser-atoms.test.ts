// @vitest-environment jsdom
// Modified by The Open Forge contributors.

import { createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";
import { activityPanelOpenAtom, activityPanelTabByProjectAtom } from "./activity-atoms";
import {
	browserUrlByWorkspaceAtom,
	openUrlInActivityWorkspaceAtom,
	setBrowserUrlForWorkspaceAtom,
} from "./browser-atoms";

describe("workspace browser state", () => {
	it("does not republish unchanged URLs while retaining explicit open behavior", () => {
		const store = createStore();
		store.set(setBrowserUrlForWorkspaceAtom, { workspaceId: "ws-1", url: "https://example.com" });
		const previous = store.get(browserUrlByWorkspaceAtom);
		const changed = vi.fn();
		const unsubscribe = store.sub(browserUrlByWorkspaceAtom, changed);
		try {
			store.set(setBrowserUrlForWorkspaceAtom, { workspaceId: "ws-1", url: "https://example.com" });
			store.set(openUrlInActivityWorkspaceAtom, { workspaceId: "ws-1", url: "https://example.com" });
			expect(store.get(browserUrlByWorkspaceAtom)).toBe(previous);
			expect(changed).not.toHaveBeenCalled();
			expect(store.get(activityPanelOpenAtom)).toBe(true);
			expect(store.get(activityPanelTabByProjectAtom).get("ws-1")).toBe("browser");
		} finally {
			unsubscribe();
		}
	});
	it("opens and remembers URLs under an explicit workspace without reading active conversation state", () => {
		const store = createStore();
		store.set(openUrlInActivityWorkspaceAtom, {
			workspaceId: "agent-team:delivery",
			url: "https://example.com/team",
		});

		expect(store.get(browserUrlByWorkspaceAtom).get("agent-team:delivery")).toBe("https://example.com/team");
		expect(store.get(activityPanelTabByProjectAtom).get("agent-team:delivery")).toBe("browser");
		expect(store.get(activityPanelOpenAtom)).toBe(true);
	});
});
