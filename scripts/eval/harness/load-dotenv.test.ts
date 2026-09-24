import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEvalDotEnv } from "./load-dotenv.js";

const previous = new Map();

function stash(key) {
	previous.set(key, process.env[key]);
	delete process.env[key];
}

afterEach(() => {
	for (const [key, value] of previous) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	previous.clear();
});

describe("loadEvalDotEnv", () => {
	it("loads unset keys from a local env file without overriding the shell", () => {
		const dir = mkdtempSync(join(tmpdir(), "openforge-eval-dotenv-"));
		const envPath = join(dir, ".env");
		writeFileSync(
			envPath,
			[
				"# comment",
				"OPENFORGE_EVAL=1",
				'DEEPSEEK_API_KEY="secret-from-file"',
				"OPENFORGE_EVAL_BASE_URL=https://api.deepseek.com",
				"",
			].join("\n"),
		);
		stash("OPENFORGE_EVAL");
		stash("DEEPSEEK_API_KEY");
		stash("OPENFORGE_EVAL_BASE_URL");
		process.env.DEEPSEEK_API_KEY = "secret-from-shell";

		const loaded = loadEvalDotEnv(envPath);
		expect(loaded.sort()).toEqual(["OPENFORGE_EVAL", "OPENFORGE_EVAL_BASE_URL"]);
		expect(process.env.OPENFORGE_EVAL).toBe("1");
		expect(process.env.OPENFORGE_EVAL_BASE_URL).toBe("https://api.deepseek.com");
		expect(process.env.DEEPSEEK_API_KEY).toBe("secret-from-shell");
	});

	it("returns an empty list when the file is missing", () => {
		const dir = mkdtempSync(join(tmpdir(), "openforge-eval-dotenv-missing-"));
		expect(loadEvalDotEnv(join(dir, "nope.env"))).toEqual([]);
	});
});
