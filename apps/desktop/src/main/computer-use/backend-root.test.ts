// Copyright The Open Forge contributors.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveComputerUseBackendRoot } from "./backend-root.js";

describe("computer-use backend resource root", () => {
	it("resolves development resources from the desktop working directory", () => {
		const cwd = "workspace/apps/desktop";
		expect(
			resolveComputerUseBackendRoot({
				isPackaged: false,
				resourcesPath: "build/resources",
				cwd,
			}),
		).toBe(join(cwd, "resources", "computer-use"));
	});

	it("resolves packaged resources from Electron's resources directory", () => {
		expect(
			resolveComputerUseBackendRoot({
				isPackaged: true,
				resourcesPath: "build/resources",
				cwd: "workspace/apps/desktop",
			}),
		).toBe(join("build", "resources", "computer-use"));
	});
});
