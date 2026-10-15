// Copyright The Open Forge contributors.
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { PluginCommandApi } from "@vetta-org/plugin-sdk";
import { afterEach, describe, expect, it } from "vitest";
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
	return {
		root,
		git,
		commit: async (paths: string[]) => {
			await git(["add", "--", ...paths]);
			await git(["commit", "--quiet", "-m", "fixture"]);
			return (await git(["rev-parse", "HEAD"])).stdout.trim();
		},
	};
}

describe("commit details against isolated Git", () => {
	it("surfaces failed git show instead of returning partial stdout", async () => {
		setGitCommand({
			run: async () => ({ stdout: "partial", stderr: "show failed", exitCode: 1 }),
			spawn: async () => {
				throw new Error("Unexpected spawn");
			},
		});
		await expect(commitFileDiff("/fixture", "HEAD", "a.txt")).rejects.toThrow("show failed");
	});

	it("reads literal bracket paths without selecting a glob-matching neighbor", async () => {
		const { root, commit } = await fixture();
		await writeFile(join(root, "file[1].txt"), "literal before");
		await writeFile(join(root, "file1.txt"), "neighbor before");
		await commit(["file[1].txt", "file1.txt"]);
		await writeFile(join(root, "file[1].txt"), "literal after");
		await writeFile(join(root, "file1.txt"), "neighbor after");
		const hash = await commit(["file[1].txt", "file1.txt"]);
		expect(parseNameStatus(await commitFiles(root, hash))).toEqual(
			expect.arrayContaining([{ path: "file[1].txt", code: "M" }]),
		);
		const patch = await commitFileDiff(root, hash, "file[1].txt");
		expect(patch).toContain("+literal after");
		expect(patch).not.toContain("+neighbor after");
	}, 10_000);
	it("keeps both paths when viewing a renamed file", async () => {
		const { root, commit } = await fixture();
		await writeFile(join(root, "old.txt"), "unchanged content\n".repeat(8));
		await commit(["old.txt"]);
		await rename(join(root, "old.txt"), join(root, "new.txt"));
		const hash = await commit(["old.txt", "new.txt"]);
		const [entry] = parseNameStatus(await commitFiles(root, hash));
		expect(entry).toEqual({ code: "R", path: "new.txt", origPath: "old.txt" });
		const patch = await commitFileDiff(root, hash, entry.path, entry.origPath);
		expect(patch).toContain("rename from old.txt");
		expect(patch).toContain("rename to new.txt");
	}, 10_000);
});
