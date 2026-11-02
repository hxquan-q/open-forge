// Modified by The Open Forge contributors.
// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AtPanelItem } from "../components/at-panel/types";
import { normalizeAtPanelDirectory, useAtPanelModel } from "./useAtPanelModel";

vi.mock("@shared/shortcuts", () => ({ useShortcutScope: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe("normalizeAtPanelDirectory", () => {
	it("rejects missing and blank directories before they reach filesystem IPC", () => {
		expect(normalizeAtPanelDirectory(undefined)).toBeUndefined();
		expect(normalizeAtPanelDirectory("  ")).toBeUndefined();
	});

	it("trims a usable directory", () => {
		expect(normalizeAtPanelDirectory("  C:/workspace  ")).toBe("C:/workspace");
	});
});

const candidates: readonly AtPanelItem[] = [
	{ kind: "team-member", id: "work-agent", name: "Work agent", insertText: "@work ", workspaceMode: "work" },
	{ kind: "team-member", id: "coding-agent", name: "Coding agent", insertText: "@coding ", workspaceMode: "coding" },
	{ kind: "team-member", id: "shared-agent", name: "Shared agent", insertText: "@shared " },
];

describe("useAtPanelModel workspace mode candidate visibility", () => {
	it("filters @ candidates without changing file browsing", () => {
		const { result } = renderHook(() =>
			useAtPanelModel({
				open: false,
				onClose: vi.fn(),
				onSelect: vi.fn(),
				filter: "@",
				cwd: "",
				workspaceMode: "coding",
				items: candidates,
			}),
		);

		expect(result.current.viewProps.entries.map((entry) => entry.name)).toEqual(["Coding agent", "Shared agent"]);
	});
});
