// Copyright The Open Forge contributors.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps the complete CLI package suite on the Node runner with one worker", () => {
	const manifest: unknown = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
	expect(manifest).toMatchObject({
		scripts: { test: "bun ../../scripts/quality/run-vitest.mjs --run --maxWorkers=1" },
	});
});
