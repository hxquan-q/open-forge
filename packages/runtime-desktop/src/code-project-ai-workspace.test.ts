// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { resolveCodeProjectAiWorkspace } from "./code-project-ai-workspace.js";

describe("resolveCodeProjectAiWorkspace", () => {
	const vettaHome = "C:/Users/test/.vetta";

	it("uses stable location identity independent of display names and project books", () => {
		const first = resolveCodeProjectAiWorkspace("C:/work/api", { vettaHome });
		const same = resolveCodeProjectAiWorkspace("c:\\work\\api\\", { vettaHome });

		expect(same).toEqual(first);
		expect(first.directory.replace(/\\/g, "/")).toBe(`${vettaHome}/workspace/code-projects/${first.id}`);
		expect(first.toolRoot).toBe(`vetta-workspace://${first.id}/`);
	});

	it("isolates same-basename local projects and changed paths", () => {
		const first = resolveCodeProjectAiWorkspace("C:/work-a/api", { vettaHome });
		const second = resolveCodeProjectAiWorkspace("C:/work-b/api", { vettaHome });
		const moved = resolveCodeProjectAiWorkspace("C:/archive/api", { vettaHome });

		expect(new Set([first.id, second.id, moved.id]).size).toBe(3);
	});

	it("isolates SSH hosts and remote paths while normalizing trailing separators", () => {
		const first = resolveCodeProjectAiWorkspace("ssh://build-a/srv/api", { vettaHome });
		const same = resolveCodeProjectAiWorkspace("ssh://build-a/srv//api/", { vettaHome });
		const otherHost = resolveCodeProjectAiWorkspace("ssh://build-b/srv/api", { vettaHome });
		const otherPath = resolveCodeProjectAiWorkspace("ssh://build-a/srv/API", { vettaHome });

		expect(same).toEqual(first);
		expect(new Set([first.id, otherHost.id, otherPath.id]).size).toBe(3);
	});
});
