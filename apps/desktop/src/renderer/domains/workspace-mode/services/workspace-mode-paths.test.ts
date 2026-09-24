import { describe, expect, it } from "vitest";
import { isWorkspaceModePath } from "./workspace-mode-paths";

describe("isWorkspaceModePath", () => {
	it.each([
		["/", true],
		["/new-session", true],
		["/new-session/%2Frepo%2Fa", true],
		["/project/%2Frepo%2Fa", true],
		["/settings/general", false],
		["/automation", false],
		["/knowledge", false],
		["/agent-teams", false],
		["/agent-teams/t1/sessions/s1", false],
		["/abilities", false],
		["/batch-tasks", false],
	])("%s → %s", (path, expected) => {
		expect(isWorkspaceModePath(path)).toBe(expected);
	});
});
