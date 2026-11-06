// Copyright The Open Forge contributors.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDesktopMemoryJournalPaths } from "./memory-journal-paths.js";

describe("resolveDesktopMemoryJournalPaths", () => {
	it("uses the project AI workspace for Code Memory and Journal", () => {
		expect(
			resolveDesktopMemoryJournalPaths(
				{ cwd: "C:/project", memoryCharLimit: 1200 },
				{
					sessionId: "code",
					agentMode: "coding",
					cwd: "C:/project",
					projectAiWorkspaceRoot: "C:/vetta/workspace/code/id",
				},
			),
		).toEqual({
			memoryFile: join("C:/vetta/workspace/code/id", "MEMORY.md"),
			journalFile: join("C:/vetta/workspace/code/id", "JOURNAL.md"),
		});
	});

	it("keeps non-Code defaults and explicit Memory file overrides", () => {
		expect(
			resolveDesktopMemoryJournalPaths(
				{ cwd: "C:/project", memoryFile: "C:/custom/MEMORY.md" },
				{
					sessionId: "work",
					agentMode: "work",
					cwd: "C:/project",
					projectAiWorkspaceRoot: "C:/vetta/workspace/code/id",
				},
			),
		).toEqual({ memoryFile: "C:/custom/MEMORY.md", journalFile: join("C:/project", "JOURNAL.md") });
	});
});
