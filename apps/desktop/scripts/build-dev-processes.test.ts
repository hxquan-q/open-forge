// Modified by The Open Forge contributors.
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { developmentBuildTasks, hashPaths } from "./build-dev-processes.mjs";

import { getMainBundledWorkspaceInputs } from "./main-bundle-workspace-inputs.mjs";

import { DEVELOPMENT_WORKSPACE_EXTERNAL } from "./packaged-native-dependencies.mjs";

const temporaryRoots: string[] = [];
afterEach(async () => {
	for (const root of temporaryRoots.splice(0)) {
		expect(root.startsWith(join(tmpdir(), "of-dev-cache-"))).toBe(true);
		await rm(root, { recursive: true, force: true });
	}
});

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
describe("Desktop development process build inputs", () => {
	it("shares exact dev external roots and their subpaths with Vite", () => {
		expect(DEVELOPMENT_WORKSPACE_EXTERNAL.test("@vetta/ai/protocol")).toBe(true);
		expect(DEVELOPMENT_WORKSPACE_EXTERNAL.test("@vetta/ai-extra")).toBe(false);
		expect(DEVELOPMENT_WORKSPACE_EXTERNAL.test("@vetta/runtime-storage")).toBe(false);
		const vite = readFileSync(new URL("../vite.main.config.ts", import.meta.url), "utf8");
		expect(vite).toContain("[DEVELOPMENT_WORKSPACE_EXTERNAL]");
	});
	it("hashes reachable bundled outputs and not external or unrelated workspace outputs", async () => {
		const root = await mkdtemp(join(tmpdir(), "of-dev-cache-"));
		temporaryRoots.push(root);
		await writeFile(
			join(root, "package.json"),
			JSON.stringify({ workspaces: ["apps/*", "packages/*", "packages/plugins/*"] }),
		);
		const manifests: Record<string, { name: string; dependencies?: Record<string, string> }> = {
			"apps/desktop": {
				name: "@vetta/desktop",
				dependencies: {
					"@vetta/runtime-node": "workspace:*",
					"@vetta/ai": "workspace:*",
					"@vetta/toolkit": "workspace:*",
					"@vetta-org/plugin-sdk": "workspace:*",
				},
			},
			"packages/runtime-node": {
				name: "@vetta/runtime-node",
				dependencies: { "@vetta/runtime-storage": "workspace:*" },
			},
			"packages/runtime-storage": { name: "@vetta/runtime-storage" },
			"packages/ai": { name: "@vetta/ai", dependencies: { "@vetta/external-child": "workspace:*" } },
			"packages/external-child": { name: "@vetta/external-child" },
			"packages/unrelated": { name: "@vetta/unrelated" },
			"packages/toolkit": { name: "@vetta/toolkit" },
			"packages/plugins/plugin-sdk": { name: "@vetta-org/plugin-sdk" },
		};
		for (const [dir, manifest] of Object.entries(manifests)) {
			await mkdir(join(root, dir, "dist"), { recursive: true });
			await writeFile(join(root, dir, "package.json"), JSON.stringify(manifest));
			await writeFile(join(root, dir, "dist/index.js"), "export const version = 1;");
		}
		const inputs = getMainBundledWorkspaceInputs(root);
		expect(inputs).toContain(join(root, "packages/runtime-storage/dist"));
		expect(inputs).toContain(join(root, "packages/plugins/plugin-sdk/dist"));
		expect(inputs).not.toContain(join(root, "packages/ai/dist"));
		expect(inputs).not.toContain(join(root, "packages/external-child/dist"));
		expect(inputs).not.toContain(join(root, "packages/unrelated/dist"));
		expect(new Set(inputs).size).toBe(inputs.length);
		expect(inputs).toContain(join(root, "packages/toolkit/src"));
		expect(inputs).not.toContain(join(root, "packages/toolkit/dist"));
		const original = await hashPaths(inputs, {});
		await writeFile(join(root, "packages/runtime-storage/dist/index.js"), "export const version = 2;");
		const updated = await hashPaths(inputs, {});
		expect(updated).not.toBe(original);
		await writeFile(join(root, "packages/ai/dist/index.js"), "export const version = 3;");
		await writeFile(join(root, "packages/unrelated/dist/index.js"), "export const version = 4;");
		expect(await hashPaths(inputs, {})).toBe(updated);
		await mkdir(join(root, "packages/toolkit/src"));
		await writeFile(join(root, "packages/toolkit/src/index.ts"), "export const source = 1;");
		expect(await hashPaths(inputs, {})).not.toBe(updated);
	});

	it("invalidates the Main bundle when bundled platform runtime outputs change", () => {
		const inputs = developmentBuildTasks.find((task) => task.name === "main")?.inputs;
		for (const name of ["runtime-desktop", "runtime-node", "plugins/plugin-sdk"]) {
			expect(inputs).toContain(join(repoRoot, "packages", name, "package.json"));
			expect(inputs).toContain(join(repoRoot, "packages", name, "dist"));
		}
		expect(inputs).toContain(join(repoRoot, "packages", "toolkit", "src"));
	});
});
