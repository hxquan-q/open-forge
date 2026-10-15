// Modified by The Open Forge contributors.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	bumpVersion,
	desktopPublishCommands,
	getUnexpectedReleaseChanges,
	parseDesktopReleaseCommand,
	parsePorcelainPaths,
	releaseNotesTemplate,
	stampReleaseDate,
	writeManifestVersion,
} from "./release-desktop.mjs";
import { ASSEMBLED_MARKER } from "./release/release-notes.mjs";

/** 夹具：统一线 manifest 的代表性子集，含根清单与 Desktop 自身。 */
const MANIFESTS = ["apps/desktop/package.json", "package.json", "packages/ai/package.json"];

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
	it("allows only the unified manifests, lockfile and target release notes", () => {
		expect(
			getUnexpectedReleaseChanges(
				" M apps/desktop/package.json\n M package.json\n M packages/ai/package.json\n M bun.lock\n?? .github/release-notes/v0.1.0.md\n",
				".github/release-notes/v0.1.0.md",
				MANIFESTS,
			),
		).toEqual([]);
		expect(
			getUnexpectedReleaseChanges(
				" M apps/desktop/package.json\n M README.md\n",
				".github/release-notes/v0.1.0.md",
				MANIFESTS,
			),
		).toEqual(["README.md"]);
	});

	it("still rejects a manifest outside the unified line", () => {
		expect(
			getUnexpectedReleaseChanges(
				" M packages/plugins/plugin-sdk/package.json\n",
				".github/release-notes/v0.1.0.md",
				MANIFESTS,
			),
		).toEqual(["packages/plugins/plugin-sdk/package.json"]);
	});
});

describe("writeManifestVersion", () => {
	function writeTempManifest(contents) {
		const path = join(mkdtempSync(join(tmpdir(), "release-desktop-")), "package.json");
		writeFileSync(path, contents);
		return path;
	}

	// 回归：多数统一线 manifest 的数组是紧凑单行写法，整体 JSON.stringify 重排会让发版提交
	// 混入与版本无关的格式噪音，所以只做定点文本替换。
	it("rewrites the top-level version and leaves the rest of the formatting alone", () => {
		const source = '{\n\t"name": "demo",\n\t"version": "0.1.2",\n\t"files": ["dist"],\n\t"bin": { "demo": "x" }\n}\n';
		const path = writeTempManifest(source);
		writeManifestVersion(path, "0.1.3");
		expect(readFileSync(path, "utf8")).toBe(
			'{\n\t"name": "demo",\n\t"version": "0.1.3",\n\t"files": ["dist"],\n\t"bin": { "demo": "x" }\n}\n',
		);
	});

	it("refuses to guess when the first version key is not the top-level one", () => {
		const path = writeTempManifest('{\n\t"name": "demo",\n\t"nested": { "version": "9.9.9" },\n\t"version": "0.1.2"\n}\n');
		expect(() => writeManifestVersion(path, "0.1.3")).toThrow(/top-level version/);
	});
});

describe("desktopPublishCommands", () => {
	it("stages every unified manifest plus the lockfile and notes, pushing branch and tag atomically", () => {
		expect(desktopPublishCommands("0.1.0", "main", MANIFESTS)).toEqual([
			[
				"add",
				"--",
				"apps/desktop/package.json",
				"package.json",
				"packages/ai/package.json",
				"bun.lock",
				".github/release-notes/v0.1.0.md",
			],
			["commit", "-m", "release(desktop): 发布 v0.1.0"],
			["tag", "v0.1.0"],
			["push", "--atomic", "origin", "main", "refs/tags/v0.1.0"],
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
