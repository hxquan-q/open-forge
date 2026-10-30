// Copyright The Open Forge contributors.
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

const MAX_GIT_BYTES = 16777216;

function gitOutput(root, args, { input, encoding = "utf8", maxBuffer = MAX_GIT_BYTES } = {}) {
	return execFileSync("git", ["-C", root, ...args], {
		encoding,
		input,
		windowsHide: true,
		shell: false,
		maxBuffer,
		timeout: 30000,
		stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
	});
}

export function git(root, args, { trim = true } = {}) {
	const output = gitOutput(root, args);
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

function* objectBatches(items, byteCost) {
	let batch = [];
	let bytes = 0;
	for (const item of items) {
		const size = byteCost(item);
		if (batch.length && bytes + size > MAX_GIT_BYTES) {
			yield batch;
			batch = [];
			bytes = 0;
		}
		batch.push(item);
		bytes += size;
	}
	if (batch.length) yield batch;
}

function objectHeader(output, offset) {
	const end = output.indexOf(10, offset);
	if (end < offset || end - offset > 128) throw new Error("invalid Git object header");
	const match = /^([a-f0-9]{40}|[a-f0-9]{64}) (blob|tree|commit|tag) (0|[1-9][0-9]*)$/u.exec(
		output.toString("latin1", offset, end),
	);
	if (!match || !Number.isSafeInteger(Number(match[3]))) throw new Error("invalid Git object header");
	return { oid: match[1], type: match[2], size: Number(match[3]), offset: end + 1 };
}

function inspectObjects(root, requests) {
	const objects = new Map();
	for (const batch of objectBatches(requests, ([spec]) => Buffer.byteLength(spec) + 128)) {
		const output = gitOutput(root, ["cat-file", "--batch-check", "-z"], {
			input: Buffer.from(`${batch.map(([spec]) => spec).join("\0")}\0`),
			encoding: null,
		});
		let offset = 0;
		for (const [spec, allowMissing] of batch) {
			// Missing responses echo the request, which can itself contain newlines.
			const missing = Buffer.from(`${spec} missing\n`);
			if (output.subarray(offset, offset + missing.length).equals(missing)) {
				if (!allowMissing) throw new Error("missing Git evidence object");
				objects.set(spec, null);
				offset += missing.length;
				continue;
			}
			const object = objectHeader(output, offset);
			if (allowMissing ? object.type !== "tree" : object.oid !== spec || object.type !== "blob")
				throw new Error("Git evidence object does not match the diff");
			if (object.type === "blob" && object.size > MAX_GIT_BYTES) throw new Error("Git evidence blob exceeds 16MiB");
			objects.set(spec, object);
			offset = object.offset;
		}
		if (offset !== output.length) throw new Error("unexpected Git object metadata");
	}
	return objects;
}

function readObjects(root, objects) {
	const bodies = new Map();
	const blobs = [...objects.values()].filter((object) => object?.type === "blob");
	const wireSize = (object) => object.size + object.oid.length + String(object.size).length + 8;
	for (const batch of objectBatches(blobs, wireSize)) {
		const output = gitOutput(root, ["cat-file", "--batch"], {
			input: `${batch.map((object) => object.oid).join("\n")}\n`,
			encoding: null,
			// Protocol framing must not reduce the existing per-blob content limit.
			maxBuffer: Math.max(
				MAX_GIT_BYTES,
				batch.reduce((bytes, object) => bytes + wireSize(object), 0),
			),
		});
		let offset = 0;
		for (const expected of batch) {
			const object = objectHeader(output, offset);
			const end = object.offset + object.size;
			if (
				object.oid !== expected.oid ||
				object.type !== "blob" ||
				object.size !== expected.size ||
				end >= output.length ||
				output[end] !== 10
			)
				throw new Error("invalid Git evidence body");
			bodies.set(object.oid, output.toString("utf8", object.offset, end));
			offset = end + 1;
		}
		if (offset !== output.length) throw new Error("unexpected Git object content");
	}
	return bodies;
}

export function readChanges(root, base, head = "HEAD") {
	if (!/^[a-f0-9]{40,64}$/u.test(base) || (head !== "HEAD" && !/^[a-f0-9]{40,64}$/u.test(head)))
		throw new Error("diff requires resolved commit ids");
	if (head === "HEAD") head = git(root, ["rev-parse", "--verify", "HEAD^{commit}"]);
	const raw = git(root, ["diff", "--raw", "--no-abbrev", "--no-renames", "--no-ext-diff", "-z", base, head], {
		trim: false,
	});
	if (!raw) return [];
	const records = raw.split("\0");
	if (records.pop() !== "" || records.length % 2) throw new Error("invalid Git raw diff");
	const changes = [];
	const requests = new Map();
	for (let index = 0; index < records.length; index += 2) {
		const metadata = /^:([0-9]{6}) ([0-9]{6}) ([a-f0-9]{40}|[a-f0-9]{64}) ([a-f0-9]{40}|[a-f0-9]{64}) [ADMT]$/u.exec(
			records[index],
		);
		const path = records[index + 1];
		if (!metadata || !path) throw new Error("invalid Git raw diff");
		const [, oldMode, newMode, oldOid, newOid] = metadata;
		for (const [mode, oid, commit] of [
			[oldMode, oldOid, base],
			[newMode, newOid, head],
		]) {
			if (mode === "000000") {
				// A missing leaf may instead have become a tree in a file/directory transition.
				requests.set(`${commit}:${path}`, true);
			} else if (mode !== "040000" && mode !== "160000") {
				requests.set(oid, false);
			}
		}
		changes.push({ path, oldMode, newMode, oldOid, newOid });
	}
	const objects = inspectObjects(root, requests);
	const bodies = readObjects(root, objects);
	const at = (mode, oid, commit, path) => {
		if (mode === "000000")
			return objects.get(`${commit}:${path}`) === null ? { mode: null, body: "" } : { mode: "unknown", body: null };
		if (mode === "040000" || mode === "160000") return { mode: "unknown", body: null };
		if (!bodies.has(oid)) throw new Error("missing Git evidence body");
		return { mode, body: bodies.get(oid) };
	};
	return changes.map(({ path, oldMode, newMode, oldOid, newOid }) => {
		const before = at(oldMode, oldOid, base, path);
		const after = at(newMode, newOid, head, path);
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
