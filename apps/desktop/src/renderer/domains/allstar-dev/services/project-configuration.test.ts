// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { getAllstarProjectConfigDirectory, getAllstarProjectConfigPath } from "./project-configuration.js";

describe("Allstar project configuration paths", () => {
	it.each([
		["/workspace/repo/", "/workspace/repo/.vetta/allstar", "/workspace/repo/.vetta/allstar/project-config.md"],
		[
			"C:\\workspace\\repo\\",
			"C:\\workspace\\repo/.vetta/allstar",
			"C:\\workspace\\repo/.vetta/allstar/project-config.md",
		],
		[
			"ssh://host-1/work/repo",
			"ssh://host-1/work/repo/.vetta/allstar",
			"ssh://host-1/work/repo/.vetta/allstar/project-config.md",
		],
	])("resolves a project-local path for %s", (cwd, directory, filePath) => {
		expect(getAllstarProjectConfigDirectory(cwd)).toBe(directory);
		expect(getAllstarProjectConfigPath(cwd)).toBe(filePath);
	});
});
