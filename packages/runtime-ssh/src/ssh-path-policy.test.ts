// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { createSshPathPolicies } from "./ssh-path-policy.js";

describe("createSshPathPolicies", () => {
	it("limits Code file tools to the remote project and current local workspace roots", () => {
		const workspaceRoot = "vetta-workspace://current-id/";
		const policies = createSshPathPolicies("/srv/project", { workspaceToolRoot: workspaceRoot });

		for (const policy of [policies.readPathPolicy, policies.editPathPolicy, policies.writePathPolicy]) {
			expect(policy.getRejectionReason("/srv/project/src/index.ts")).toBeUndefined();
			expect(policy.getRejectionReason(`${workspaceRoot}project-config.md`)).toBeUndefined();
			expect(policy.getRejectionReason("/etc/passwd")).toContain("limited to the current project");
			expect(policy.getRejectionReason("vetta-workspace://other-id/secret.md")).toContain(
				"limited to the current project",
			);
			expect(policy.getRejectionReason(`${workspaceRoot}../other/secret.md`)).toContain(
				"escapes its authorized root",
			);
		}

		expect(policies.searchPathPolicy.getRejectionReason("/srv/project/src/index.ts")).toBeUndefined();
		expect(policies.searchPathPolicy.getRejectionReason("/etc/passwd")).toContain("limited to the current project");
		expect(policies.searchPathPolicy.getRejectionReason(`${workspaceRoot}project-config.md`)).toContain(
			"Search tools run on the SSH host",
		);
		expect(policies.writePathPolicy.getRejectionReason("/srv/project/.vetta/skills/demo/SKILL.md")).toContain(
			"read-only",
		);
	});

	it("preserves the existing permissive SSH behavior when no Code workspace root is supplied", () => {
		const policies = createSshPathPolicies("/srv/project");
		expect(policies.readPathPolicy.getRejectionReason("/etc/hosts")).toBeUndefined();
		expect(policies.searchPathPolicy.getRejectionReason("/etc/hosts")).toBeUndefined();
	});
});
