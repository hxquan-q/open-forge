// Modified by The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	bumpVersion,
	desktopPublishCommands,
	getUnexpectedReleaseChanges,
	parseDesktopReleaseCommand,
	parsePorcelainPaths,
	releaseNotesTemplate,
	stampReleaseDate,
} from "./release-desktop.mjs";
import { ASSEMBLED_MARKER } from "./release/release-notes.mjs";

describe("parsePorcelainPaths", () => {
	// 回归：曾经对整段输出做 trim，削掉第一行的前导空格后 slice(3) 吃掉路径首字母，
	// 于是第一个改动文件永远匹配不上发布白名单（"apps/..." 被读成 "pps/..."）。
	it("keeps the leading path character of the first unstaged entry", () => {
		const stdout = " M apps/desktop/CHANGELOG.md\n M apps/desktop/package.json\n M bun.lock\n";
		expect(parsePorcelainPaths(stdout)).toEqual([
			"apps/desktop/CHANGELOG.md",
			"apps/desktop/package.json",
			"bun.lock",
		]);
	});

	it("parses staged, unstaged and untracked prefixes alike", () => {
		const stdout = "M  apps/desktop/package.json\n?? scratch.txt\nMM bun.lock\n";
		expect(parsePorcelainPaths(stdout)).toEqual([
			"apps/desktop/package.json",
			"scratch.txt",
			"bun.lock",
		]);
	});

	it("returns nothing for a clean worktree", () => {
		expect(parsePorcelainPaths("")).toEqual([]);
		expect(parsePorcelainPaths("\n")).toEqual([]);
	});

	it("normalizes Windows separators", () => {
		expect(parsePorcelainPaths(" M apps\\desktop\\package.json\n")).toEqual([
			"apps/desktop/package.json",
		]);
	});
});

describe("bumpVersion", () => {
	it("bumps patch, minor and major", () => {
		expect(bumpVersion("0.5.47", "patch")).toBe("0.5.48");
		expect(bumpVersion("0.5.47", "minor")).toBe("0.6.0");
		expect(bumpVersion("0.5.47", "major")).toBe("1.0.0");
	});

	it("rejects a non-semver desktop version", () => {
		expect(() => bumpVersion("0.5", "patch")).toThrow(/Invalid desktop version/);
	});
});

describe("parseDesktopReleaseCommand", () => {
	it("separates local preparation from explicitly confirmed publishing", () => {
		expect(parseDesktopReleaseCommand(["prepare", "patch"])).toEqual({
			command: "prepare",
			kind: "bump",
			value: "patch",
		});
		expect(parseDesktopReleaseCommand(["publish", "0.1.0", "--confirm-publish"])).toEqual({
			command: "publish",
			version: "0.1.0",
		});
	});

	it("rejects publishing without explicit authorization", () => {
		expect(() => parseDesktopReleaseCommand(["publish", "0.1.0"])).toThrow(/--confirm-publish/);
	});

	it("accepts an explicit first-version reset only with the initial flag", () => {
		expect(parseDesktopReleaseCommand(["prepare", "--version", "0.1.0", "--initial"])).toEqual({
			command: "prepare",
			kind: "set",
			version: "0.1.0",
			initial: true,
		});
		expect(() => parseDesktopReleaseCommand(["prepare", "--version", "0.1.0"])).toThrow(/--initial/);
	});
});

describe("releaseNotesTemplate", () => {
	it("marks the draft as fragment-managed so assembly does not treat it as hand-written", () => {
		expect(releaseNotesTemplate("0.1.3", "abc1234")).toContain(ASSEMBLED_MARKER);
	});
	it("creates a fork-branded draft with an explicit date placeholder and upstream baseline", () => {
		expect(releaseNotesTemplate("0.1.0", "abc1234")).toContain("# Open Forge 0.1.0");
		expect(releaseNotesTemplate("0.1.0", "abc1234")).toContain("发布日期：待定");
		expect(releaseNotesTemplate("0.1.0", "abc1234")).toContain("Upstream baseline: upstream/dev@abc1234");
	});
});

describe("getUnexpectedReleaseChanges", () => {
	it("allows only the version manifests, lockfile and target release notes", () => {
		expect(
			getUnexpectedReleaseChanges(
				" M apps/desktop/package.json\n M package.json\n M bun.lock\n?? .github/release-notes/v0.1.0.md\n",
				".github/release-notes/v0.1.0.md",
			),
		).toEqual([]);
		expect(
			getUnexpectedReleaseChanges(
				" M apps/desktop/package.json\n M README.md\n",
				".github/release-notes/v0.1.0.md",
			),
		).toEqual(["README.md"]);
	});
});

describe("desktopPublishCommands", () => {
	it("stages only release files and pushes branch plus tag atomically", () => {
		expect(desktopPublishCommands("0.1.0", "forge/dev")).toEqual([
			["add", "--", "apps/desktop/package.json", "package.json", "bun.lock", ".github/release-notes/v0.1.0.md"],
			["commit", "-m", "release(desktop): 发布 v0.1.0"],
			["tag", "v0.1.0"],
			["push", "--atomic", "origin", "forge/dev", "refs/tags/v0.1.0"],
		]);
	});
});

describe("stampReleaseDate", () => {
	it("replaces the placeholder date with the publish date", () => {
		const notes = "# Open Forge 0.1.3\n\n发布日期：待定\n";
		expect(stampReleaseDate(notes, "2026-10-05")).toBe("# Open Forge 0.1.3\n\n发布日期：2026-10-05\n");
	});

	it("refuses to rewrite a note that already carries a real date", () => {
		const notes = "# Open Forge 0.1.3\n\n发布日期：2026-09-29\n";
		expect(() => stampReleaseDate(notes, "2026-10-05")).toThrow(/不是占位/);
	});

	it("stamps the draft that prepare produces", () => {
		const stamped = stampReleaseDate(releaseNotesTemplate("0.1.3", "abc1234"), "2026-10-05");
		expect(stamped).toContain("发布日期：2026-10-05");
		expect(stamped).not.toContain("待定");
	});
});
