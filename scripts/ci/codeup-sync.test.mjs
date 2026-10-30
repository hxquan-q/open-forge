// Copyright The Open Forge contributors.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { syncAllRefs } from "./codeup-sync.mjs";

const roots = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "codeup-test-"));
	roots.push(root);
	const source = join(root, "source");
	const destination = join(root, "target.git");
	const git = (cwd, ...args) =>
		execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
	execFileSync("git", ["init", "--initial-branch=dev", source], { stdio: "pipe" });
	execFileSync("git", ["init", "--bare", destination], { stdio: "pipe" });
	git(source, "config", "user.email", "test@example.invalid");
	git(source, "config", "user.name", "test");
	const commit = (text) => {
		writeFileSync(join(source, "file.txt"), text);
		git(source, "add", "file.txt");
		git(source, "commit", "-m", text);
		return git(source, "rev-parse", "HEAD");
	};
	commit("initial");
	const refs = (repo) => git(repo, "show-ref", "--heads", "--tags");
	return { root, source, destination, git, commit, refs };
}
describe("one-way Codeup synchronization", { timeout: 30_000 }, () => {
	it("copies all heads, annotated/light tags and history; retries and new branches work", () => {
		const f = fixture();
		f.git(f.source, "branch", "main");
		f.git(f.source, "tag", "-a", "v1", "-m", "release");
		f.git(f.source, "tag", "light");
		f.git(f.source, "update-ref", "refs/remotes/upstream/only", "HEAD");
		f.commit("second");
		const result = syncAllRefs(f);
		expect(result.updated).toBe(4);
		expect(f.refs(f.destination)).toBe(f.refs(f.source));
		expect(f.git(f.destination, "rev-list", "--all", "--count")).toBe("2");
		expect(f.git(f.destination, "for-each-ref", "--format=%(refname)")).not.toContain("upstream");
		expect(syncAllRefs(f).updated).toBe(0);
		f.git(f.source, "branch", "feature/new");
		f.commit("third");
		syncAllRefs(f);
		expect(f.refs(f.destination)).toBe(f.refs(f.source));
	});
	it("does not delete target-only refs or propagate source deletion", () => {
		const f = fixture();
		syncAllRefs(f);
		f.git(f.destination, "branch", "retained", "dev");
		f.git(f.source, "branch", "temporary");
		syncAllRefs(f);
		f.git(f.source, "branch", "-d", "temporary");
		syncAllRefs(f);
		expect(f.refs(f.destination)).toContain("refs/heads/retained");
		expect(f.refs(f.destination)).toContain("refs/heads/temporary");
	});
	it("rejects divergent history before changing any refs", () => {
		const f = fixture();
		const first = f.git(f.source, "rev-parse", "HEAD");
		syncAllRefs(f);
		const second = f.commit("second");
		f.git(f.destination, "fetch", f.source, `${second}:refs/heads/dev`);
		f.git(f.source, "update-ref", "refs/heads/dev", first);
		f.git(f.source, "branch", "must-not-appear");
		const before = f.refs(f.destination);
		expect(() => syncAllRefs(f)).toThrow(/non-fast-forward/);
		expect(f.refs(f.destination)).toBe(before);
	});
	it("rejects a moved tag and never executes checked-out repository code", () => {
		const f = fixture();
		f.git(f.source, "tag", "v1");
		syncAllRefs(f);
		f.commit("second");
		f.git(f.source, "update-ref", "refs/tags/v1", "HEAD");
		const before = f.refs(f.destination);
		expect(() => syncAllRefs(f)).toThrow(/tag conflict/);
		expect(f.refs(f.destination)).toBe(before);
		expect(readFileSync(join(f.source, "file.txt"), "utf8")).toBe("second");
	});
});
