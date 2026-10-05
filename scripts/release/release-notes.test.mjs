// Modified by The Open Forge contributors.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	desktopVersion,
	releaseNotesPath,
	releaseNotesStateProblems,
	releaseNotesVersions,
	requireReleaseNotes,
} from "./release-notes.mjs";

const roots = [];

function fixtureRoot(version, notesVersions = []) {
	const root = mkdtempSync(join(tmpdir(), "vetta-release-notes-"));
	roots.push(root);
	mkdirSync(join(root, "apps/desktop"), { recursive: true });
	writeFileSync(join(root, "apps/desktop/package.json"), JSON.stringify({ version }));
	mkdirSync(join(root, ".github/release-notes"), { recursive: true });
	for (const notesVersion of notesVersions) {
		writeFileSync(join(root, ".github/release-notes", `v${notesVersion}.md`), `# Vetta ${notesVersion}\n`);
	}
	return root;
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("release notes addressing", () => {
	it("maps a version to its release notes file", () => {
		expect(releaseNotesPath("0.5.58")).toBe(".github/release-notes/v0.5.58.md");
	});

	it("rejects a version that is not semver", () => {
		expect(() => releaseNotesPath("0.5")).toThrow(/Invalid release version/);
		expect(() => releaseNotesPath("v0.5.58")).toThrow(/Invalid release version/);
	});

	it("resolves the desktop version from the package manifest", () => {
		expect(desktopVersion(fixtureRoot("0.5.58"))).toBe("0.5.58");
	});

	it("returns the path when the notes exist", () => {
		const root = fixtureRoot("0.5.58", ["0.5.58"]);
		expect(requireReleaseNotes("0.5.58", root)).toBe(".github/release-notes/v0.5.58.md");
	});

	// 缺发布说明必须拦住发版：它就是 Release 的正文，补不上就没有正文可发。
	it("explains how to fix a missing release note", () => {
		const root = fixtureRoot("0.5.59", ["0.5.58"]);
		expect(() => requireReleaseNotes("0.5.59", root)).toThrow(/Missing release notes for v0\.5\.59/);
		expect(() => requireReleaseNotes("0.5.59", root)).toThrow(/release-notes\/README\.md/);
	});

	it("ships release notes for the version this repository is about to release", () => {
		expect(requireReleaseNotes(desktopVersion())).toMatch(/^\.github\/release-notes\/v\d+\.\d+\.\d+\.md$/);
	});
});

const BASELINE = "Upstream baseline: upstream/dev@d217984c72ef7b5f66ce0a6fea1ae2375060d425";

function stateNotes({ date = "发布日期：待定", title = "# Open Forge 0.1.3" } = {}) {
	return [title, "", date, "", BASELINE, "", "## 改进", "", "- 一条占位条目", ""].join("\n");
}

describe("release notes state", () => {
	it("accepts the placeholder date while the version has no tag", () => {
		expect(releaseNotesStateProblems({ version: "0.1.3", notes: stateNotes(), hasTag: false })).toEqual([]);
	});

	it("rejects a concrete date for a version that has no tag", () => {
		const problems = releaseNotesStateProblems({
			version: "0.1.3",
			notes: stateNotes({ date: "发布日期：2026-09-29" }),
			hasTag: false,
		});
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain("发布日期必须停在");
	});

	it("rejects the placeholder date once the version is tagged", () => {
		const problems = releaseNotesStateProblems({ version: "0.1.3", notes: stateNotes(), hasTag: true });
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain("不应还停留在占位");
	});

	it("rejects a title that does not match the version", () => {
		const problems = releaseNotesStateProblems({
			version: "0.1.3",
			notes: stateNotes({ title: "# Open Forge 0.1.2" }),
			hasTag: false,
		});
		expect(problems[0]).toContain("标题必须是");
	});

	it("rejects a missing upstream baseline line", () => {
		const problems = releaseNotesStateProblems({
			version: "0.1.3",
			notes: "# Open Forge 0.1.3\n\n发布日期：待定\n",
			hasTag: false,
		});
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain("Upstream baseline");
	});

	it("skips the date rule when git information is unavailable", () => {
		const notes = stateNotes({ date: "发布日期：2026-09-29" });
		expect(releaseNotesStateProblems({ version: "0.1.3", notes, hasTag: undefined })).toEqual([]);
	});
});

describe("release notes versions", () => {
	it("lists the v*.md versions and ignores other files", () => {
		const root = fixtureRoot("0.1.3", ["0.1.2", "0.1.3"]);
		writeFileSync(join(root, ".github/release-notes", "README.md"), "# notes\n");
		expect(releaseNotesVersions(root)).toEqual(["0.1.2", "0.1.3"]);
	});
});
