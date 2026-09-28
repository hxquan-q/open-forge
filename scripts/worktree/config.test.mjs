import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	chooseBaseRef,
	DEFAULT_CONFIG,
	globToRegExp,
	isSensitiveIncludePath,
	loadWorktreeConfig,
	matchesAny,
	parseWorktreeInclude,
	readWorktreeInclude,
	selectIncludeFiles,
	selectSetupCommands,
	WORKTREE_CONFIG_FILE,
} from "./config.mjs";

const tempDirs = [];

function tempRoot(files = {}) {
	const dir = mkdtempSync(join(tmpdir(), "worktree-config-"));
	tempDirs.push(dir);
	for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content, "utf8");
	return dir;
}

afterEach(() => {
	while (tempDirs.length > 0) rmSync(tempDirs.pop(), { recursive: true, force: true });
});

describe("include pattern matching", () => {
	const cases = [
		[".env.local", ".env.local", true],
		[".env.local", ".env", false],
		["*.pem", "cert.pem", true],
		["*.pem", "nested/cert.pem", false],
		["**/*.pem", "nested/cert.pem", true],
		["config/secrets.json", "config/secrets.json", true],
		["config/*.json", "config/secrets.json", true],
		["config/*.json", "config/nested/secrets.json", false],
		["vscode/settings?.json", "vscode/settings1.json", true],
		["vscode/settings?.json", "vscode/settings.json", false],
	];

	it.each(cases)("%s matches %s → %s", (pattern, path, expected) => {
		expect(matchesAny([pattern], path)).toBe(expected);
	});

	it("escapes regex metacharacters instead of treating them as patterns", () => {
		expect(globToRegExp("a+b(c).json").test("a+b(c).json")).toBe(true);
		expect(globToRegExp("a+b(c).json").test("aab(c).json")).toBe(false);
	});
});

describe("credential deny list", () => {
	const denied = [
		".env",
		".env.production",
		"nested/.env",
		"cert.pem",
		"server.key",
		"identity.p12",
		"id_rsa",
		"id_ed25519.pub",
		".npmrc",
		".netrc",
		".git-credentials",
		"config/credentials.json",
		"deploy/secrets.yaml",
		".claude/settings.local.json",
		"deploy/config.prod.yaml",
	];
	const allowed = [".env.example", ".env.local.sample", "notes.md", "config/theme.json", "deploy/config.example.yaml"];

	it.each(denied)("refuses to copy %s", (path) => {
		expect(isSensitiveIncludePath(path)).toBe(true);
	});

	it.each(allowed)("allows %s", (path) => {
		expect(isSensitiveIncludePath(path)).toBe(false);
	});
});

describe("include file selection", () => {
	it("copies only files that are both matched and ignored by git, and never credentials", () => {
		const { selected, skipped } = selectIncludeFiles({
			patterns: ["local/*.json", ".env"],
			ignoredFiles: ["local/state.json", "local/other.txt", ".env", "local/notes.md"],
		});
		expect(selected).toEqual(["local/state.json"]);
		expect(skipped).toEqual([".env"]);
	});

	it("reads patterns and reports a negation it cannot honor", () => {
		const { patterns, problems } = parseWorktreeInclude(
			["# comment", "", "./local/state.json", "/root-only.json", "!keep.json"].join("\n"),
		);
		expect(patterns).toEqual(["local/state.json", "root-only.json"]);
		expect(problems.join(" ")).toContain("negation");
	});

	it("rejects an include file that targets credentials", () => {
		const root = tempRoot({ ".worktreeinclude": ".env\n" });
		expect(readWorktreeInclude(root).problems.join(" ")).toContain("credentials");
	});
});

describe("setup command selection", () => {
	const config = { setup: { windows: ["win-only"], unix: ["unix-only"], fallback: ["generic"] } };

	it("prefers the platform-specific list", () => {
		expect(selectSetupCommands(config, "win32")).toEqual(["win-only"]);
		expect(selectSetupCommands(config, "linux")).toEqual(["unix-only"]);
		expect(selectSetupCommands(config, "darwin")).toEqual(["unix-only"]);
	});

	it("falls back only when the platform list is absent, not when it is empty", () => {
		expect(selectSetupCommands({ setup: { fallback: ["generic"] } }, "linux")).toEqual(["generic"]);
		expect(selectSetupCommands({ setup: { unix: [], fallback: ["generic"] } }, "linux")).toEqual([]);
	});

	it("runs nothing when no setup is configured", () => {
		expect(selectSetupCommands({}, "linux")).toEqual([]);
		expect(selectSetupCommands(DEFAULT_CONFIG, "win32")).toEqual([]);
	});
});

describe("baseline selection", () => {
	const config = { baseRef: "origin/forge/dev", baseRefFallbacks: ["origin/dev", "HEAD"] };
	const existsOnly =
		(...refs) =>
		(ref) =>
			refs.includes(ref);

	it("prefers an explicit request", () => {
		expect(chooseBaseRef({ requested: "HEAD", config, exists: existsOnly("HEAD", "origin/dev") })).toBe("HEAD");
	});

	it("falls back to the configured ref, then the fallback chain", () => {
		expect(chooseBaseRef({ requested: null, config, exists: existsOnly("origin/forge/dev") })).toBe(
			"origin/forge/dev",
		);
		expect(chooseBaseRef({ requested: null, config, exists: existsOnly("origin/dev") })).toBe("origin/dev");
		expect(chooseBaseRef({ requested: null, config, exists: existsOnly("HEAD") })).toBe("HEAD");
	});

	it("pins repository-created worktrees to local main and fails closed if it is missing", () => {
		const repositoryConfig = JSON.parse(
			readFileSync(join(import.meta.dirname, "../../.worktreeconfig.json"), "utf8"),
		);
		expect(repositoryConfig.baseRef).toBe("main");
		expect(repositoryConfig.baseRefFallbacks).toEqual([]);
		expect(chooseBaseRef({ requested: null, config: repositoryConfig, exists: existsOnly("main", "HEAD") })).toBe(
			"main",
		);
		expect(chooseBaseRef({ requested: null, config: repositoryConfig, exists: existsOnly("HEAD") })).toBeNull();
	});

	it("returns null rather than guessing when nothing resolves", () => {
		expect(chooseBaseRef({ requested: "missing", config, exists: () => false })).toBeNull();
		expect(chooseBaseRef({ requested: null, config, exists: () => false })).toBeNull();
	});
});

describe("config loading", () => {
	it("reports an absent config and keeps the inert defaults", () => {
		const loaded = loadWorktreeConfig(tempRoot());
		expect(loaded.present).toBe(false);
		expect(loaded.config).toMatchObject({
			worktreeRoot: DEFAULT_CONFIG.worktreeRoot,
			baseRef: "main",
			baseRefFallbacks: [],
			copyIgnored: false,
		});
	});

	it("surfaces invalid JSON instead of silently using defaults", () => {
		const loaded = loadWorktreeConfig(tempRoot({ [WORKTREE_CONFIG_FILE]: "{ not json" }));
		expect(loaded.present).toBe(true);
		expect(loaded.problems.join(" ")).toContain("invalid JSON");
	});

	it("reports each malformed field", () => {
		const loaded = loadWorktreeConfig(
			tempRoot({
				[WORKTREE_CONFIG_FILE]: JSON.stringify({
					worktreeRoot: "",
					copyIgnored: "yes",
					setup: { windows: [""] },
					cleanup: { intervalHours: 0, maxWorktrees: 1.5 },
				}),
			}),
		);
		const problems = loaded.problems.join("\n");
		expect(problems).toContain("worktreeRoot");
		expect(problems).toContain("copyIgnored");
		expect(problems).toContain("setup.windows");
		expect(problems).toContain("intervalHours");
		expect(problems).toContain("maxWorktrees");
	});

	it("merges a valid config over the defaults", () => {
		const loaded = loadWorktreeConfig(
			tempRoot({
				[WORKTREE_CONFIG_FILE]: JSON.stringify({
					worktreeRoot: "../wt",
					baseRef: "origin/main",
					copyIgnored: true,
					setup: { unix: ["bun install"] },
				}),
			}),
		);
		expect(loaded.problems).toEqual([]);
		expect(loaded.config).toMatchObject({ worktreeRoot: "../wt", baseRef: "origin/main", copyIgnored: true });
		expect(loaded.config.cleanup).toEqual(DEFAULT_CONFIG.cleanup);
	});
});
