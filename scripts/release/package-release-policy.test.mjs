// Copyright The Open Forge contributors.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validatePackageReleaseScope } from "./package-release-policy.mjs";

const lockstepPackages = [
	{ path: "package.json", version: "0.55.3" },
	{ path: "packages/runtime-knowledge/package.json", version: "0.55.3" },
];

describe("validatePackageReleaseScope", () => {
	it("requires the release scope to be explicitly selected", () => {
		expect(() =>
			validatePackageReleaseScope({ scope: undefined, pushAuthorized: true, packages: lockstepPackages }),
		).toThrow(/RELEASE_PACKAGE_SCOPE=lockstep/);
	});

	it("requires explicit authorization before a package release can push", () => {
		expect(() =>
			validatePackageReleaseScope({ scope: "lockstep", pushAuthorized: false, packages: lockstepPackages }),
		).toThrow(/RELEASE_PUSH=true/);
	});

	it("refuses to rewrite independent package versions as a lockstep release", () => {
		expect(() =>
			validatePackageReleaseScope({
				scope: "lockstep",
				pushAuthorized: true,
				packages: [...lockstepPackages, { path: "packages/coding-agent/package.json", version: "0.0.1" }],
			}),
		).toThrow(/packages\/coding-agent\/package.json.*0.0.1/);
	});

	it("returns the shared version only for an explicitly authorized lockstep cohort", () => {
		expect(
			validatePackageReleaseScope({ scope: "lockstep", pushAuthorized: true, packages: lockstepPackages }),
		).toBe("0.55.3");
	});
});

describe("workspace publish surface (ISSUE-0009)", () => {
	function workspaceManifestPaths() {
		const root = JSON.parse(readFileSync("package.json", "utf8"));
		const paths = [];
		for (const glob of root.workspaces?.packages ?? root.workspaces ?? []) {
			if (!glob.endsWith("/*")) {
				if (existsSync(join(glob, "package.json"))) paths.push(join(glob, "package.json"));
				continue;
			}
			const base = glob.slice(0, -2);
			if (!existsSync(base)) continue;
			for (const dir of readdirSync(base)) {
				const path = join(base, dir, "package.json");
				if (existsSync(path)) paths.push(path);
			}
		}
		return paths;
	}

	it("routes publish and publish:private through the fail-closed gate", () => {
		const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
		for (const name of ["publish", "publish:private"]) {
			expect(scripts[name]).toContain("publish-private.mjs");
			expect(scripts[name]).not.toMatch(/npm publish -ws(?!\S)/);
		}
	});

	it("marks every workspace package without publishConfig as private", () => {
		const exposed = workspaceManifestPaths()
			.map((path) => ({ path: path.replaceAll("\\", "/"), manifest: JSON.parse(readFileSync(path, "utf8")) }))
			.filter(({ manifest }) => manifest.private !== true && !manifest.publishConfig)
			.map(({ path }) => path);
		expect(exposed).toEqual([]);
	});
});

describe("root manifest release surface", () => {
	it("exposes no unguarded workspace-wide version bump", () => {
		const root = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
		const offenders = Object.entries(root.scripts ?? {}).filter(([, command]) =>
			/npm version +-ws/.test(String(command)),
		);
		expect(offenders).toEqual([]);
	});
});
