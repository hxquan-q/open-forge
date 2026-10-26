// Copyright The Open Forge contributors.
// Embedded into the Flow definition by render-flow.mjs; never loaded from a triggering branch.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const SOURCE = "https://github.com/hxquan-q/open-forge.git";
export const DESTINATION = "https://codeup.aliyun.com/621301e6c5006adb19febbd6/Allstar_AI/ALLSTAR-AI.git";

export function syncAllRefs({ source = SOURCE, destination = DESTINATION, env = process.env } = {}) {
	const directory = mkdtempSync(join(tmpdir(), "codeup-sync-"));
	const bare = join(directory, "snapshot.git");
	const askpass = join(directory, "askpass.sh");
	// A POSIX helper works for Git for Windows and Linux; Git passes the prompt as $1.
	// It contains no secret; Git reads the password from the helper's private output pipe.
	writeFileSync(
		askpass,
		`#!/bin/sh\ncase "$1" in\n  *sername*) printf "%s" "\${CODEUP_GIT_USERNAME:-oauth2}" ;;\n  *) printf "%s" "$CODEUP_GIT_TOKEN" ;;\nesac\n`,
		{ mode: 0o700 },
	);
	const commandEnv = {
		...env,
		GIT_TERMINAL_PROMPT: "0",
		GCM_INTERACTIVE: "never",
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_CONFIG_GLOBAL: "/dev/null",
		GIT_ASKPASS: askpass.replaceAll("\\", "/"),
	};
	function git(args, { allowFailure = false } = {}) {
		const result = spawnSync("git", ["-c", "http.version=HTTP/1.1", "-c", "credential.helper=", ...args], {
			env: commandEnv,
			encoding: "utf8",
			maxBuffer: 8 * 1024 * 1024,
			timeout: 300_000,
			windowsHide: true,
		});
		if (result.error || result.status !== 0) {
			if (allowFailure && !result.error && result.status === 1) return false;
			// Never forward Git's remote messages, URLs or credential-bearing diagnostics.
			throw new Error(
				`Git ${args.includes("push") ? "push" : "operation"} failed (exit ${result.status ?? "unavailable"}). Check access, branch protection and atomic-push support.`,
			);
		}
		return result.stdout.trim();
	}
	const local = (args, options) => git(["--git-dir", bare, ...args], options);
	const refs = (prefix) =>
		new Map(
			local(["for-each-ref", "--format=%(refname) %(objectname)", `${prefix}/heads`, `${prefix}/tags`])
				.split("\n")
				.filter(Boolean)
				.map((line) => {
					const [name, sha] = line.split(" ");
					return [name.replace(prefix, "refs"), sha];
				}),
		);
	try {
		git(["init", "--bare", bare]);
		local(["fetch", "--no-tags", source, "refs/heads/*:refs/heads/*", "refs/tags/*:refs/tags/*"]);
		const snapshot = refs("refs");
		if (snapshot.size === 0) throw new Error("Source contains no branch or tag; refusing synchronization.");
		local(["fetch", "--no-tags", destination, "refs/heads/*:refs/target/heads/*", "refs/tags/*:refs/target/tags/*"]);
		const target = refs("refs/target");
		const updates = [];
		for (const [ref, sha] of snapshot) {
			const old = target.get(ref);
			if (old === sha) continue;
			if (old && ref.startsWith("refs/tags/")) throw new Error(`Refusing tag conflict: ${ref}`);
			if (old && local(["merge-base", "--is-ancestor", old, sha], { allowFailure: true }) === false) {
				throw new Error(`Refusing non-fast-forward: ${ref}`);
			}
			updates.push(`${sha}:${ref}`);
		}
		// Ordinary atomic push: a concurrent newer target rejects the entire transaction.
		// No force, deletion, prune, mirror or synthetic refs are ever sent.
		if (updates.length) local(["push", "--atomic", destination, ...updates]);
		return {
			branches: [...snapshot.keys()].filter((ref) => ref.startsWith("refs/heads/")).length,
			tags: [...snapshot.keys()].filter((ref) => ref.startsWith("refs/tags/")).length,
			updated: updates.length,
		};
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	try {
		if (!process.env.CODEUP_GIT_TOKEN) throw new Error("Missing encrypted CODEUP_GIT_TOKEN variable.");
		console.log(JSON.stringify(syncAllRefs()));
	} catch (error) {
		console.error(error instanceof Error ? error.message : "Synchronization failed.");
		process.exitCode = 1;
	}
}
