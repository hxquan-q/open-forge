// Copyright The Open Forge contributors.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CODEUP, GITHUB, renderPipelines } from "./render-flow.mjs";

describe("Flow pipeline contracts", () => {
	it("keeps trusted sync code and credentials out of the tested branch", () => {
		const [sync, ci] = renderPipelines({ variableGroupId: "123" }).map((p) => JSON.parse(p.content));
		expect(sync.sources.github).toMatchObject({
			type: "git",
			endpoint: GITHUB,
			triggerEvents: ["push"],
			branchesFilter: ".*",
		});
		expect(sync.variableGroups).toEqual(["123"]);
		expect(ci.variableGroups).toBeUndefined();
		expect(ci.sources.codeup).toMatchObject({
			endpoint: CODEUP,
			cloneDepth: 0,
			triggerEvents: ["push"],
			branchesFilter: "^dev$",
			certificate: { serviceConnection: "e35k9qkwkyicf6yy" },
		});
		const script = sync.stages.sync.jobs.mirror.steps.command.with.run;
		const archive = script.match(/printf '%s' '([A-Za-z0-9+/=]+)' \| base64 -d/);
		expect(archive).toBeTruthy();
		expect(Buffer.from(archive[1], "base64").toString("utf8")).toBe(
			readFileSync(new URL("./codeup-sync.mjs", import.meta.url), "utf8"),
		);
		expect(script).toContain("dnf install -y nodejs");
		expect(script).not.toContain("node scripts/ci/");
		expect(script).not.toMatch(/git push.*--(?:mirror|force|delete)/);
		const image = "build-steps-public-registry.cn-beijing.cr.aliyuncs.com/build-steps/alinux3:latest";
		expect(sync.stages.sync.jobs.mirror.runsOn.container).toBe(image);
		expect(ci.stages.verify.jobs.verify.runsOn.container).toBe(image);
		expect(ci.stages.verify.jobs.verify.runsOn.instanceType).toBe("LARGE_4C8G");
	});
	it("fails on a missing SHA and runs the established gates before builds", () => {
		const [, ci] = renderPipelines().map((p) => JSON.parse(p.content));
		const run = ci.stages.verify.jobs.verify.steps.command.with.run;
		for (const command of [
			"check",
			"test:quality",
			"verify:runtime-contract",
			"verify:artifact:installed",
			"test:changed",
			"build:cli",
			"build:docs",
		])
			expect(run).toContain(`bun run ${command}`);
		expect(run).toContain("git checkout --detach");
		expect(run).toContain("sha256sum --check --status");
		expect(run).toContain("dnf install -y nodejs ripgrep unzip");
		expect(run).not.toContain("apt-get");
		expect(run).toContain("registry.npmmirror.com/-/binary/bun/");
		expect(run).toContain("BUN_CONFIG_REGISTRY=https://registry.npmmirror.com");
		expect(run).not.toContain("github.com/oven-sh/bun");
		expect(run.indexOf("bun run test:changed")).toBeLessThan(run.indexOf("bun run build:cli"));
		expect(run).not.toMatch(/release:desktop|publish:private|continue-on-error/);
	});
	it("rejects injected connection and group IDs", () => {
		expect(() => renderPipelines({ connectionId: "12\nsteps:" })).toThrow();
		expect(() => renderPipelines({ variableGroupId: "allstar codeup" })).toThrow();
		expect(() => renderPipelines({ variableGroupId: "allstar_codeup" })).not.toThrow();
	});
});
