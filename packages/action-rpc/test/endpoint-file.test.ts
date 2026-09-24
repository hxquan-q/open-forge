// Copyright The Open Forge contributors.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fakeHome = mkdtempSync(join(tmpdir(), "endpoint-file-test-"));

vi.mock("node:os", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:os")>();
	return { ...actual, homedir: () => fakeHome };
});

const { getVettaHomePath, DEFAULT_CONFIG_DIR_NAME } = await import("../src/endpoint-file.js");

describe("getVettaHomePath", () => {
	beforeEach(() => {
		for (const name of [".openforge", ".vetta", ".custom"]) {
			rmSync(join(fakeHome, name), { recursive: true, force: true });
		}
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("defaults to ~/.openforge", () => {
		expect(DEFAULT_CONFIG_DIR_NAME).toBe(".openforge");
		expect(getVettaHomePath()).toBe(join(fakeHome, ".openforge"));
	});

	it("honours VETTA_HOME and VETTA_CONFIG_DIR overrides without migration", () => {
		mkdirSync(join(fakeHome, ".vetta"));
		vi.stubEnv("VETTA_CONFIG_DIR", ".custom");
		expect(getVettaHomePath()).toBe(join(fakeHome, ".custom"));
		vi.stubEnv("VETTA_HOME", join(fakeHome, "elsewhere"));
		expect(getVettaHomePath()).toBe(join(fakeHome, "elsewhere"));
		expect(existsSync(join(fakeHome, ".vetta"))).toBe(true);
	});

	it("renames a legacy ~/.vetta root to ~/.openforge once", () => {
		const legacy = join(fakeHome, ".vetta");
		mkdirSync(legacy);
		writeFileSync(join(legacy, "settings.json"), "{}");
		expect(getVettaHomePath()).toBe(join(fakeHome, ".openforge"));
		expect(existsSync(join(fakeHome, ".openforge", "settings.json"))).toBe(true);
		expect(existsSync(legacy)).toBe(false);
	});

	it("keeps both roots when the new one already exists", () => {
		mkdirSync(join(fakeHome, ".vetta"));
		mkdirSync(join(fakeHome, ".openforge"));
		expect(getVettaHomePath()).toBe(join(fakeHome, ".openforge"));
		expect(existsSync(join(fakeHome, ".vetta"))).toBe(true);
	});
});
