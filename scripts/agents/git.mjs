// Copyright The Open Forge contributors.
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

export function git(root, args, { trim = true } = {}) {
	const output = execFileSync("git", ["-C", root, ...args], {
		encoding: "utf8",
		windowsHide: true,
		shell: false,
		maxBuffer: 16777216,
		stdio: ["ignore", "pipe", "pipe"],
	});
	return trim ? output.trimEnd() : output;
}

export function snapshot(root, { clean = true } = {}) {
	const repository = realpathSync(root);
	const metadata = git(repository, ["rev-parse", "--show-toplevel", "HEAD", "HEAD^{tree}"]).split(/\r?\n/u);
	if (metadata.length !== 3 || realpathSync(metadata[0]) !== repository)
		throw new Error("worktree must name its repository root");
	const status = git(repository, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
	if (clean && status) throw new Error("worktree is not clean");
	return {
		head: metadata[1],
		tree: metadata[2],
		clean: !status,
	};
}

export function matchesPath(path, pattern) {
	if (
		typeof path !== "string" ||
		typeof pattern !== "string" ||
		path.includes("\\") ||
		path.split("/").some((part) => part === ".." || part === "")
	)
		throw new Error("invalid repository path");
	if (pattern.includes("\\") || pattern.split("/").some((part) => part === ".." || part === ""))
		throw new Error("invalid repository scope");
	if (/[[\]{}]/u.test(pattern)) throw new Error("unsupported scope glob");
	if (!/[*?]/u.test(pattern)) return path === pattern || path.startsWith(`${pattern}/`);
	let expression = "";
	for (let index = 0; index < pattern.length; index++) {
		const character = pattern[index];
		if (character === "*" && pattern[index + 1] === "*") {
			index++;
			if (pattern[index + 1] === "/") {
				expression += "(?:[^/]+/)*";
				index++;
			} else expression += ".*";
		} else if (character === "*") expression += "[^/]*";
		else if (character === "?") expression += "[^/]";
		else expression += character.replace(/[.+^$()|\\]/gu, "\\$&");
	}
	return new RegExp(`^${expression}$`, process.platform === "win32" ? "iu" : "u").test(path);
}

export function changedFiles(root, base, head = "HEAD") {
	if (!/^[a-f0-9]{40,64}$/u.test(base) || (head !== "HEAD" && !/^[a-f0-9]{40,64}$/u.test(head)))
		throw new Error("diff requires resolved commit ids");
	return git(root, ["diff", "--name-only", "--no-renames", "-z", base, head]).split("\0").filter(Boolean);
}

export function readChanges(root, base, head = "HEAD") {
	const at = (commit, path) => {
		const entry = git(root, ["ls-tree", "-z", commit, "--", path]);
		if (!entry) return { mode: null, body: "" };
		const metadata = /^([0-9]{6}) blob ([a-f0-9]{40,64})\t/u.exec(entry);
		if (!metadata) return { mode: "unknown", body: null };
		return { mode: metadata[1], body: git(root, ["show", "--no-textconv", `${commit}:${path}`], { trim: false }) };
	};
	return changedFiles(root, base, head).map((path) => {
		const before = at(base, path);
		const after = at(head, path);
		return { path, before: before.body, after: after.body, oldMode: before.mode, newMode: after.mode };
	});
}

export function assertWriteScope(root, base, patterns) {
	const files = changedFiles(root, base);
	for (const file of files) {
		if (!patterns.some((pattern) => matchesPath(file, pattern)))
			throw new Error(`change escapes Task write scope: ${file}`);
	}
	return files;
}

export function assertSeparateRoots(worktree, stateRoot) {
	const fold = (value) => (process.platform === "win32" ? value.toLowerCase() : value);
	const worker = fold(realpathSync(worktree));
	const controller = fold(realpathSync(stateRoot));
	const separator = process.platform === "win32" ? "\\" : "/";
	if (
		worker === controller ||
		controller.startsWith(`${worker}${separator}`) ||
		worker.startsWith(`${controller}${separator}`)
	)
		throw new Error("controller state and worker worktree must be separate");
	return resolve(worktree);
}
