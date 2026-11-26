// Copyright The Open Forge contributors.
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { PluginCommandApi } from "@vetta-org/plugin-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { createBranchAtCommit, detachAtCommit, readHeadState, resetToCommit } from "../src/git/commitActions";
import { commitFileDiff, commitFiles } from "../src/git/log";
import { parseNameStatus } from "../src/git/parseLog";
import { setGitCommand } from "../src/git/runtime";

const runFile = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) {
		expect(root.startsWith(join(tmpdir(), "of-git-history-"))).toBe(true);
		await rm(root, { recursive: true, force: true });
	}
});

/** Isolated repository: sanitized env, hooks disabled, config per invocation. */
async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "of-git-history-"));
	roots.push(root);
	const empty = join(root, "empty-template");
	await mkdir(empty);
	const config = join(root, "empty-config");
	await writeFile(config, "");
	const env = {
		PATH: process.env.PATH,
		SystemRoot: process.env.SystemRoot,
		HOME: root,
		USERPROFILE: root,
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_CONFIG_GLOBAL: config,
		GIT_CONFIG_SYSTEM: config,
		LC_ALL: "C",
	};
	const git = (args: string[]) =>
		runFile(
			"git",
			[
				"-c",
				"user.name=Fixture",
				"-c",
				"user.email=fixture@example.invalid",
				"-c",
				`core.hooksPath=${empty}`,
				"-c",
				"core.autocrlf=false",
				"-c",
				"commit.gpgsign=false",
				...args,
			],
			{ cwd: root, env, encoding: "utf8" },
		);
	await git(["init", "--quiet", "--initial-branch=main", `--template=${empty}`]);
	const api: PluginCommandApi = {
		run: async (file, args = [], options) => {
			expect(file).toBe("git");
			expect(options?.cwd).toBe(root);
			const { stdout, stderr } = await git(args);
			return { stdout, stderr, exitCode: 0 };
		},
		spawn: async () => {
			throw new Error("Unexpected background command");
		},
	};
	setGitCommand(api);
	const out = async (args: string[]) => (await git(args)).stdout.trim();
	return { root, git, out };
}

describe("commit history in an isolated repository", () => {
	it("returns all root/normal/merge files and preserves a rename diff", async () => {
		const { root, out } = await fixture();
		await writeFile(join(root, "first.txt"), "one\n");
		await writeFile(join(root, "second.txt"), "two\n");
		await out(["add", "--", "first.txt", "second.txt"]);
		await out(["commit", "--quiet", "-m", "initial"]);
		const initial = await out(["rev-parse", "HEAD"]);
		await out(["mv", "first.txt", "renamed.txt"]);
		await writeFile(join(root, "second.txt"), "changed\n");
		await out(["add", "--", "second.txt"]);
		await out(["commit", "--quiet", "-m", "rename and edit"]);
		const latest = await out(["rev-parse", "HEAD"]);

		expect(parseNameStatus(await commitFiles(root, initial))).toHaveLength(2);
		const files = parseNameStatus(await commitFiles(root, latest));
		expect(files).toEqual([
			{ path: "renamed.txt", origPath: "first.txt", code: "R" },
			{ path: "second.txt", code: "M" },
		]);
		expect(await commitFileDiff(root, latest, files[0])).toContain("rename from first.txt");

		await out(["checkout", "-b", "side", initial]);
		await writeFile(join(root, "third.txt"), "three\n");
		await out(["add", "--", "third.txt"]);
		await out(["commit", "--quiet", "-m", "side"]);
		await out(["checkout", "main"]);
		await out(["merge", "--no-ff", "side", "-m", "merge"]);
		expect(parseNameStatus(await commitFiles(root, await out(["rev-parse", "HEAD"])))).toEqual([
			{ path: "third.txt", code: "A" },
		]);
	}, 20_000);
});

describe("commit write actions in an isolated repository", () => {
	async function twoCommitFixture() {
		const fx = await fixture();
		await writeFile(join(fx.root, "first.txt"), "one\n");
		await writeFile(join(fx.root, "second.txt"), "two\n");
		await fx.out(["add", "--", "first.txt", "second.txt"]);
		await fx.out(["commit", "--quiet", "-m", "initial"]);
		const initial = await fx.out(["rev-parse", "HEAD"]);
		await writeFile(join(fx.root, "second.txt"), "changed\n");
		await fx.out(["add", "--", "second.txt"]);
		await fx.out(["commit", "--quiet", "-m", "edit"]);
		const latest = await fx.out(["rev-parse", "HEAD"]);
		return { ...fx, initial, latest };
	}

	it("creates a branch at the selected commit without switching, then detaches safely", async () => {
		const { root, out, initial } = await twoCommitFixture();
		await createBranchAtCommit(root, initial, "feature/history");
		expect(await out(["rev-parse", "feature/history"])).toBe(initial);
		expect(await out(["branch", "--show-current"])).toBe("main");
		await detachAtCommit(root, initial);
		expect(await readHeadState(root)).toEqual({ hash: initial, branch: null });
	}, 20_000);

	it.each(["soft", "mixed", "hard"] as const)(
		"applies %s reset with its promised index/working-tree behavior",
		async (mode) => {
			const { root, out, initial } = await twoCommitFixture();
			await writeFile(join(root, "second.txt"), "uncommitted\n");
			await out(["add", "--", "second.txt"]);
			const index = await out(["write-tree"]);
			await resetToCommit(root, initial, mode, await readHeadState(root));
			expect(await out(["rev-parse", "HEAD"])).toBe(initial);
			expect(await readFile(join(root, "second.txt"), "utf8")).toBe(mode === "hard" ? "two\n" : "uncommitted\n");
			expect(await out(["write-tree"])).toBe(mode === "soft" ? index : await out(["rev-parse", `${initial}^{tree}`]));
		},
		20_000,
	);

	it("rejects changed HEAD and unsafe branch/revision arguments before writing", async () => {
		const { root, out, initial, latest } = await twoCommitFixture();
		const expected = await readHeadState(root);
		await out(["checkout", "-b", "other"]);
		await expect(resetToCommit(root, initial, "hard", expected)).rejects.toThrow("HEAD changed");
		await out(["checkout", "main"]);
		await expect(createBranchAtCommit(root, "--help", "safe")).rejects.toThrow("Invalid commit");
		await expect(createBranchAtCommit(root, initial, "-f")).rejects.toThrow("Invalid branch");
		expect(await out(["rev-parse", "HEAD"])).toBe(latest);
	}, 20_000);
});
