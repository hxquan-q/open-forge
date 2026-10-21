// Copyright The Open Forge contributors.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll } from "vitest";

// This setup runs before application imports capture their data/log paths.
// A home per test file also keeps parallel workers out of each other's state.
const home = mkdtempSync(join(tmpdir(), "open-forge-desktop-test-"));
process.env.VETTA_HOME = home;

afterAll(() => {
	if (dirname(home) !== resolve(tmpdir())) throw new Error("Test home escaped the temporary directory");
	rmSync(home, { recursive: true, force: true });
});
