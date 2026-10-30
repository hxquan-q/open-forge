// Copyright The Open Forge contributors.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const shaPattern = /^[0-9a-f]{40}$/i;

function runGit(args, cwd) {
	return spawnSync("git", args, { cwd, encoding: "utf8", timeout: 60_000 });
}

function runGitHub(args, cwd) {
	return spawnSync("gh", args, { cwd, encoding: "utf8", timeout: 60_000 });
}

function fail(message) {
	throw new Error(`[verify-desktop-release-identity] ${message}`);
}

export function verifyDesktopReleaseIdentity({
	version,
	candidateSha,
	releaseTarget,
	cwd = repoRoot,
	git = runGit,
}) {
	if (typeof version !== "string" || version.trim() !== version || !/^\d+\.\d+\.\d+$/.test(version)) {
		fail("invalid release version");
	}
	if (typeof candidateSha !== "string" || candidateSha.length !== 40 || !shaPattern.test(candidateSha)) {
		fail("a full candidate SHA is required");
	}
	if (!["github", "r2"].includes(releaseTarget)) fail("release target must be github or r2");
	candidateSha = candidateSha.toLowerCase();
	const head = git(["rev-parse", "HEAD"], cwd);
	if (head.error || head.status !== 0 || head.stdout.trim().toLowerCase() !== candidateSha) {
		fail("checked-out HEAD does not match the candidate SHA");
	}

	const tag = `v${version}`;
	const ref = `refs/tags/${tag}`;
	// Query the remote every time; a shallow checkout or a stale local tag is not release evidence.
	const remote = git(["ls-remote", "--exit-code", "origin", ref, `${ref}^{}`], cwd);
	if (remote.error || ![0, 2].includes(remote.status)) fail(`remote lookup failed for ${tag}`);
	const output = remote.stdout.trim();
	if (remote.status === 2) {
		if (output) fail(`unexpected remote lookup output for ${tag}`);
		if (releaseTarget === "r2") fail(`remote tag ${tag} must already exist`);
		return { tag, candidateSha, tagCommit: null };
	}

	const refs = new Map();
	for (const line of output.split(/\r?\n/)) {
		const [sha, name, extra] = line.split("\t");
		if (!shaPattern.test(sha) || ![ref, `${ref}^{}`].includes(name) || extra !== undefined || refs.has(name)) {
			fail(`invalid remote tag response for ${tag}`);
		}
		refs.set(name, sha.toLowerCase());
	}
	if (!refs.has(ref)) fail(`remote tag ${tag} has no direct ref`);
	// An annotated tag's object ID is not the commit that produced the artifacts.
	const tagCommit = refs.get(`${ref}^{}`) ?? refs.get(ref);
	if (tagCommit !== candidateSha) fail(`remote tag ${tag} points to ${tagCommit}, not candidate ${candidateSha}`);
	return { tag, candidateSha, tagCommit };
}

function verifyGitHubDraft({ tag, candidateSha, tagCommit }, cwd, github) {
	const response = github(["release", "view", tag, "--json", "isDraft,tagName,targetCommitish"], cwd);
	if (response.error || response.status !== 0) fail(`draft lookup failed for ${tag}`);
	let draft;
	try {
		draft = JSON.parse(response.stdout);
	} catch {
		fail(`invalid draft response for ${tag}`);
	}
	if (
		!draft || typeof draft !== "object" || Array.isArray(draft) || draft.isDraft !== true ||
		draft.tagName !== tag || typeof draft.targetCommitish !== "string" || !draft.targetCommitish
	) {
		fail(`invalid draft identity for ${tag}`);
	}
	// Without a tag, GitHub will create one from the draft's saved target, not the uploaded artifacts.
	if (!tagCommit && (!shaPattern.test(draft.targetCommitish) || draft.targetCommitish.toLowerCase() !== candidateSha)) {
		fail(`draft target does not match the candidate SHA for ${tag}`);
	}
}

export function main({
	env = process.env, args = process.argv.slice(2), cwd = repoRoot, git = runGit, github = runGitHub,
} = {}) {
	const checkDraft = args.length === 1 && args[0] === "--github-draft";
	if (args.length > 0 && !checkDraft) fail("unknown argument");
	const version = env.BUILD_VERSION || JSON.parse(readFileSync(resolve(cwd, "apps/desktop/package.json"), "utf8")).version;
	const result = verifyDesktopReleaseIdentity({
		version,
		candidateSha: env.GITHUB_SHA,
		releaseTarget: env.RELEASE_TARGET,
		cwd,
		git,
	});
	if (checkDraft) verifyGitHubDraft(result, cwd, github);
	console.info(
		`[verify-desktop-release-identity] ${result.tag}: ${result.tagCommit ? "matches candidate" : "GitHub may create candidate tag"} ${result.candidateSha}`,
	);
	return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : "Release identity verification failed");
		process.exitCode = 1;
	}
}
