// Copyright The Open Forge contributors.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(join(import.meta.dirname, "../../.github/workflows/codeup-sync.yml"), "utf8");

describe("Codeup synchronization workflow", () => {
	it("runs only from trusted main and never from pull requests", () => {
		expect(workflow).toContain("ref: main");
		expect(workflow).toContain("fetch-depth: 1");
		expect(workflow).toContain("push:");
		expect(workflow).toContain("- main");
		expect(workflow).toContain("workflow_dispatch:");
		expect(workflow).toContain('cron: "*/5 * * * *"');
		expect(workflow).not.toMatch(/pull_request/);
		expect(workflow).not.toMatch(/pull_request_target/);
	});

	it("keeps the write token out of untrusted code and uses the tested control script", () => {
		expect(workflow).toContain("permissions:\n  contents: read");
		expect(workflow).toContain("CODEUP_GIT_TOKEN: $" + "{{ secrets.CODEUP_GIT_TOKEN }}");
		expect(workflow).toContain("run: node scripts/ci/codeup-sync.mjs");
		expect(workflow).not.toMatch(/git push/);
		expect(workflow).not.toMatch(/--(?:mirror|force|delete)/);
		expect(workflow).not.toMatch(/cancel-in-progress: true/);
	});
});
