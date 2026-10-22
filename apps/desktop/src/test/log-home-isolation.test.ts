// Copyright The Open Forge contributors.
import { readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { getVettaHomePath } from "@vetta/action-rpc";
import { expect, it } from "vitest";
import { getAppLogger } from "../main/logger.js";

it("keeps real application logging inside a temporary home for this test file", () => {
	const home = getVettaHomePath();
	expect(dirname(home)).toBe(resolve(tmpdir()));
	expect(basename(home)).toMatch(/^open-forge-desktop-test-/);
	const marker = "isolated-desktop-logger-fixture";
	getAppLogger("test-home-isolation").info(marker);
	const directory = join(home, "desktop-app", "logs", "main");
	const contents = readdirSync(directory)
		.filter((file) => file.endsWith(".log"))
		.map((file) => readFileSync(join(directory, file), "utf8"))
		.join("\n");
	expect(contents).toContain(marker);
});
