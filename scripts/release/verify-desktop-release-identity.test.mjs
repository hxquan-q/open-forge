// Copyright The Open Forge contributors.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { main, verifyDesktopReleaseIdentity } from "./verify-desktop-release-identity.mjs";

const version = "1.2.3";
const candidateSha = "a".repeat(40);
const otherSha = "b".repeat(40);

function git(cwd, ...args) {
	return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

function commit(cwd, message) {
	git(
		cwd,
		"-c", "user.name=Release Fixture",
		"-c", "user.email=fixture@example.invalid",
		"-c", "core.hooksPath=disabled-hooks",
		"commit", "--allow-empty", "--no-gpg-sign", "-m", message,
	);
	return git(cwd, "rev-parse", "HEAD");
}

function withRepository(run) {
	const root = mkdtempSync(join(tmpdir(), "openforge-release-identity-"));
	const cwd = join(root, "source");
	const remote = join(root, "remote.git");
	try {
		mkdirSync(cwd);
		git(cwd, "init", "--quiet");
		git(cwd, "init", "--quiet", "--bare", remote);
		git(cwd, "remote", "add", "origin", remote);
		const sha = commit(cwd, "candidate");
		return run({ cwd, remote, sha });
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

function inspect(cwd, sha, options = {}) {
	return verifyDesktopReleaseIdentity({ version, candidateSha: sha, releaseTarget: "github", cwd, ...options });
}

function publishTag(cwd, sha, annotated = false) {
	git(
		cwd,
		"-c", "user.name=Release Fixture",
		"-c", "user.email=fixture@example.invalid",
		"-c", "tag.gpgSign=false",
		"tag",
		...(annotated ? ["-a", `v${version}`, "-m", "release fixture", sha] : [`v${version}`, sha]),
	);
	git(cwd, "push", "--quiet", "origin", `refs/tags/v${version}`);
}

describe("Desktop release source identity", () => {
	it("allows GitHub tag creation, rechecks the published tag, and rejects a later candidate for the same version", () => {
		withRepository(({ cwd, sha }) => {
			expect(inspect(cwd, sha)).toEqual({ tag: "v1.2.3", candidateSha: sha, tagCommit: null });
			publishTag(cwd, sha);
			expect(inspect(cwd, sha).tagCommit).toBe(sha);
			const next = commit(cwd, "new candidate must use a new tag");
			expect(() => inspect(cwd, next)).toThrow(`points to ${sha}, not candidate ${next}`);
		});
	});

	it("uses an annotated tag's peeled commit rather than its tag object ID", () => {
		withRepository(({ cwd, sha }) => {
			publishTag(cwd, sha, true);
			expect(git(cwd, "rev-parse", `refs/tags/v${version}`)).not.toBe(sha);
			expect(inspect(cwd, sha).tagCommit).toBe(sha);
			const next = commit(cwd, "different candidate");
			expect(() => inspect(cwd, next)).toThrow("not candidate");
		});
	});

	it("requires an existing matching tag for R2", () => {
		withRepository(({ cwd, sha }) => {
			expect(() => inspect(cwd, sha, { releaseTarget: "r2" })).toThrow("must already exist");
			publishTag(cwd, sha);
			expect(inspect(cwd, sha, { releaseTarget: "r2" }).tagCommit).toBe(sha);
		});
	});

	it("does not trust a local tag when the remote has a different commit", () => {
		withRepository(({ cwd, sha }) => {
			publishTag(cwd, sha);
			const next = commit(cwd, "candidate with a misleading local tag");
			git(cwd, "tag", "--delete", `v${version}`);
			git(cwd, "-c", "tag.gpgSign=false", "tag", `v${version}`, next);
			expect(() => inspect(cwd, next)).toThrow(`points to ${sha}`);
		});
	});

	it("rejects an explicit candidate SHA that is not the checked-out source", () => {
		withRepository(({ cwd, sha }) => {
			const next = commit(cwd, "checked-out source");
			expect(next).not.toBe(sha);
			expect(() => inspect(cwd, sha)).toThrow("HEAD does not match");
		});
	});

	it("does not confuse a failed remote query with a missing tag", () => {
		withRepository(({ cwd, sha, remote }) => {
			rmSync(remote, { recursive: true, force: true });
			expect(() => inspect(cwd, sha)).toThrow("remote lookup failed");
		});
	});

	it("reads the manifest or explicit build version through the workflow entry point", () => {
		withRepository(({ cwd, sha }) => {
			mkdirSync(join(cwd, "apps/desktop"), { recursive: true });
			writeFileSync(join(cwd, "apps/desktop/package.json"), JSON.stringify({ version }));
			const log = vi.spyOn(console, "info").mockImplementation(() => {});
			try {
				expect(main({ cwd, args: [], env: { GITHUB_SHA: sha, RELEASE_TARGET: "github" } }).tag).toBe("v1.2.3");
				expect(main({
					cwd,
					args: [],
					env: { GITHUB_SHA: sha, RELEASE_TARGET: "github", BUILD_VERSION: "2.0.0" },
				}).tag).toBe("v2.0.0");
				expect(() => main({ cwd, args: [], env: { RELEASE_TARGET: "github" } })).toThrow("full candidate SHA");
			} finally {
				log.mockRestore();
			}
		});
	});

	it("checks draft identity after Git, allowing creation and an existing R2 tag", () => {
		withRepository(({ cwd, sha }) => {
			const env = { BUILD_VERSION: version, GITHUB_SHA: sha, RELEASE_TARGET: "github" };
			let targetCommitish = sha;
			const github = vi.fn(() => ({
				status: 0,
				stdout: JSON.stringify({ isDraft: true, tagName: "v1.2.3", targetCommitish }),
			}));
			const log = vi.spyOn(console, "info").mockImplementation(() => {});
			try {
				expect(main({ cwd, env, args: ["--github-draft"], github }).tagCommit).toBeNull();
				expect(github).toHaveBeenCalledWith(
					["release", "view", "v1.2.3", "--json", "isDraft,tagName,targetCommitish"], cwd,
				);
				github.mockClear();
				env.RELEASE_TARGET = "r2";
				expect(() => main({ cwd, env, args: ["--github-draft"], github })).toThrow("must already exist");
				expect(github).not.toHaveBeenCalled();
				publishTag(cwd, sha);
				targetCommitish = "main";
				expect(main({ cwd, env, args: ["--github-draft"], github }).tagCommit).toBe(sha);
				env.GITHUB_SHA = commit(cwd, "different candidate");
				github.mockClear();
				expect(() => main({ cwd, env, args: ["--github-draft"], github })).toThrow("not candidate");
				expect(github).not.toHaveBeenCalled();
			} finally {
				log.mockRestore();
			}
		});
	});

	it.each([
		{ name: "failed lookup", response: { status: 1, stdout: "" }, error: "draft lookup failed" },
		{ name: "timed-out lookup", response: { status: null, error: new Error("timeout") }, error: "draft lookup failed" },
		{ name: "malformed JSON", response: { status: 0, stdout: "{" }, error: "invalid draft response" },
		...[
			null,
			[],
			{},
			{ isDraft: false, tagName: "v1.2.3", targetCommitish: candidateSha },
			{ isDraft: "true", tagName: "v1.2.3", targetCommitish: candidateSha },
			{ isDraft: true, tagName: "v9.9.9", targetCommitish: candidateSha },
			{ isDraft: true, tagName: "v1.2.3", targetCommitish: "" },
			{ isDraft: true, tagName: "v1.2.3", targetCommitish: 123 },
		].map((draft) => ({ name: JSON.stringify(draft), response: { status: 0, stdout: JSON.stringify(draft) }, error: "invalid draft identity" })),
		...[otherSha, "main", candidateSha.slice(0, 7), `${candidateSha}\n`].map((targetCommitish) => ({
			name: `unproven target ${JSON.stringify(targetCommitish)}`,
			response: { status: 0, stdout: JSON.stringify({ isDraft: true, tagName: "v1.2.3", targetCommitish }) },
			error: "draft target does not match the candidate SHA",
		})),
	])("fails closed for $name", ({ response, error }) => {
		const github = vi.fn(() => response);
		const command = vi.fn((args) => args[0] === "rev-parse"
			? { status: 0, stdout: candidateSha }
			: { status: 2, stdout: "" });
		expect(() => main({
			args: ["--github-draft"],
			env: { BUILD_VERSION: version, GITHUB_SHA: candidateSha, RELEASE_TARGET: "github" },
			git: command,
			github,
		})).toThrow(error);
		expect(github).toHaveBeenCalledOnce();
	});

	it("rejects unknown arguments before invoking an external command", () => {
		const command = vi.fn();
		expect(() => main({ args: ["--unknown"], git: command, github: command })).toThrow("unknown argument");
		expect(command).not.toHaveBeenCalled();
	});

	it.each([
		{ version: "v1.2.3" },
		{ version: "1.2.3\n" },
		{ candidateSha: "main" },
		{ candidateSha: "abcdef0" },
		{ releaseTarget: "unknown" },
	])("rejects invalid inputs before running Git: %j", (invalid) => {
		const command = vi.fn();
		expect(() => verifyDesktopReleaseIdentity({ version, candidateSha, releaseTarget: "github", git: command, ...invalid })).toThrow();
		expect(command).not.toHaveBeenCalled();
	});

	it.each([
		{ status: 0, stdout: "" },
		{ status: 0, stdout: `${otherSha}\trefs/tags/v1.2.3^{}\n` },
		{ status: 0, stdout: `${candidateSha}\trefs/tags/v1.2.3\n${otherSha}\trefs/tags/v1.2.3\n` },
		{ status: 0, stdout: `${candidateSha}\trefs/heads/main\n` },
		{ status: 2, stdout: `${candidateSha}\trefs/tags/v1.2.3\n` },
		{ status: 128, stdout: "" },
		{ status: null, stdout: "", error: new Error("lookup timed out") },
	])("fails closed on invalid or failed remote responses: %j", (remote) => {
		const command = vi.fn().mockReturnValueOnce({ status: 0, stdout: `${candidateSha}\n` }).mockReturnValueOnce(remote);
		expect(() => verifyDesktopReleaseIdentity({ version, candidateSha, releaseTarget: "github", git: command })).toThrow();
		expect(command.mock.calls[1][0]).toEqual(["ls-remote", "--exit-code", "origin", "refs/tags/v1.2.3", "refs/tags/v1.2.3^{}"]);
	});
});
