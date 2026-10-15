// Copyright The Open Forge contributors.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DEVELOPMENT_WORKSPACE_EXTERNAL } from "./packaged-native-dependencies.mjs";

/** Follow the Desktop workspace graph, stopping at packages loaded externally in dev. */
export function getMainBundledWorkspaceInputs(root) {
	const packages = readWorkspaceManifests(root);
	const desktop = packages.find((pkg) => pkg.dir === "apps/desktop");
	if (!desktop) throw new Error("Desktop workspace manifest is missing");
	const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
	const bundled = new Map();
	function visit(name) {
		const pkg = byName.get(name);
		if (!pkg || !pkg.dir.startsWith("packages/") || DEVELOPMENT_WORKSPACE_EXTERNAL.test(name) || bundled.has(name))
			return;
		bundled.set(name, pkg);
		for (const dependency of Object.keys(pkg.dependencies)) visit(dependency);
	}
	for (const dependency of Object.keys(desktop.dependencies)) visit(dependency);
	return [...bundled.values()]
		.sort((left, right) => left.dir.localeCompare(right.dir))
		.flatMap((pkg) => [
			join(root, pkg.dir, "package.json"),
			// toolkit is resolved from source by Vite's toolkitSourceAlias.
			join(root, pkg.dir, pkg.name === "@vetta/toolkit" ? "src" : "dist"),
		]);
}

// Build scripts stay inside the Desktop module boundary; quality tooling is not a runtime dependency.
function readWorkspaceManifests(root) {
	const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
	const directories = new Set();
	for (const pattern of manifest.workspaces ?? []) {
		let paths = [""];
		for (const part of pattern.split("/")) {
			if (part === "*") {
				paths = paths.flatMap((dir) =>
					readdirSync(join(root, dir), { withFileTypes: true })
						.filter((entry) => entry.isDirectory())
						.map((entry) => (dir ? `${dir}/${entry.name}` : entry.name)),
				);
			} else {
				if (!part || part === "." || part === ".." || /[*?{}[\]\\:]/.test(part))
					throw new Error(`Unsupported workspace pattern: ${pattern}`);
				paths = paths.map((dir) => (dir ? `${dir}/${part}` : part));
			}
		}
		for (const dir of paths) directories.add(dir);
	}
	return [...directories].flatMap((dir) => {
		const path = join(root, dir, "package.json");
		if (!existsSync(path)) return [];
		const pkg = JSON.parse(readFileSync(path, "utf8"));
		if (typeof pkg.name !== "string" || !pkg.name) throw new Error(`Workspace name missing: ${dir}`);
		return [
			{
				dir,
				name: pkg.name,
				dependencies: {
					...pkg.dependencies,
					...pkg.optionalDependencies,
					...pkg.peerDependencies,
					...pkg.devDependencies,
				},
			},
		];
	});
}
