// Copyright The Open Forge contributors.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { auditDesign } from "./design.mjs";
import { changedFiles, git, readChanges, snapshot } from "./git.mjs";
import { classifyChanges } from "./policy.mjs";

vi.mock("node:child_process", async (importOriginal) => {
	const actual = await importOriginal();
	return { ...actual, execFileSync: vi.fn(actual.execFileSync) };
});

const roots = [];
const execute = vi.mocked(execFileSync).getMockImplementation();
afterEach(() => {
	vi.mocked(execFileSync).mockImplementation(execute).mockClear();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "forge-git-changes-"));
	roots.push(root);
	git(root, ["init", "--quiet"]);
	appendFileSync(
		join(root, ".git/config"),
		"\n[user]\n\tname = Fixture\n\temail = fixture@example.invalid\n[commit]\n\tgpgsign = false\n[core]\n\thooksPath = /dev/null\n\tautocrlf = false\n",
	);
	return root;
}

function commit(root, paths, message) {
	git(root, ["add", "--", ...paths]);
	git(root, ["commit", "--quiet", "-m", message]);
	return git(root, ["rev-parse", "HEAD"]);
}

function inputGit(root, args, input) {
	return execFileSync("git", ["-C", root, ...args], {
		input,
		encoding: "utf8",
		windowsHide: true,
		shell: false,
		maxBuffer: 16777216,
		timeout: 30000,
		stdio: ["pipe", "pipe", "pipe"],
	}).trimEnd();
}

function importBlobs(root, bodies) {
	if (!bodies.length) return [];
	const input = bodies.flatMap((body, index) => {
		const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
		return [Buffer.from(`blob\nmark :${index + 1}\ndata ${bytes.length}\n`), bytes, Buffer.from("\n")];
	});
	const marksPath = join(root, ".git/fixture-blob-marks");
	inputGit(root, ["fast-import", "--quiet", `--export-marks=${marksPath}`], Buffer.concat(input));
	const marks = new Map(
		readFileSync(marksPath, "utf8")
			.trimEnd()
			.split("\n")
			.map((line) => line.split(" ")),
	);
	return bodies.map((_body, index) => {
		const oid = marks.get(`:${index + 1}`);
		if (!/^[a-f0-9]{40,64}$/u.test(oid ?? "")) throw new Error("fixture blob mark is missing or invalid");
		return oid;
	});
}

function commitTree(root, entries, parent) {
	git(root, ["read-tree", "--empty"]);
	const imported = importBlobs(
		root,
		entries.filter(({ oid }) => oid == null).map(({ body = "" }) => body),
	);
	let next = 0;
	const records = entries.map(({ path, mode = "100644", oid }) => {
		const object = oid ?? imported[next++];
		return `${mode} ${mode === "160000" ? "commit" : "blob"} ${object}\t${path}\0`;
	});
	if (records.length) inputGit(root, ["update-index", "-z", "--index-info"], records.join(""));
	const tree = git(root, ["write-tree"]);
	const result = git(root, ["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", "tree fixture"]);
	git(root, ["update-ref", "HEAD", result]);
	return result;
}

function highBitHeader(output) {
	const corrupted = Buffer.from(output);
	corrupted[0] |= 0x80;
	return corrupted;
}

function bodyBatches() {
	const { calls, results } = vi.mocked(execFileSync).mock;
	return calls.flatMap(([, args, options], index) =>
		args.includes("--batch")
			? [{ input: options.input, maxBuffer: options.maxBuffer, bytes: results[index].value.length }]
			: [],
	);
}

describe("candidate change evidence from real Git objects", () => {
	it("imports fixture blobs with byte framing and the same object ids as hash-object", () => {
		const root = fixture();
		const bodies = [
			Buffer.alloc(0),
			"雪😀\nblob\nmark :99\ndata 0\n\0trailing \r\n",
			Buffer.from([0, 255, 254, 65, 10, 0]),
			"no final newline",
		];
		const objects = importBlobs(root, [...bodies, bodies[1]]);
		expect(objects).toHaveLength(bodies.length + 1);
		for (const [index, body] of bodies.entries()) {
			const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
			expect(objects[index]).toBe(inputGit(root, ["hash-object", "--stdin"], bytes));
			const actual = execFileSync("git", ["-C", root, "cat-file", "blob", objects[index]], {
				windowsHide: true,
				shell: false,
				maxBuffer: 16777216,
				timeout: 30000,
				stdio: ["ignore", "pipe", "pipe"],
			});
			expect(actual.equals(bytes)).toBe(true);
		}
		expect(objects.at(-1)).toBe(objects[1]);
	});
	it("preserves complete ordered content and modes without starting Git for every file", () => {
		const root = fixture();
		const paths = ["a.txt", "b.txt", "c.txt", "d.txt"];
		for (const path of paths) writeFileSync(join(root, path), `before ${path}\n`);
		const base = commit(root, paths, "base fixture");
		for (const path of paths) writeFileSync(join(root, path), `after ${path}\n`);
		const head = commit(root, paths, "candidate fixture");
		vi.mocked(execFileSync).mockClear();

		expect(readChanges(root, base, head)).toEqual(
			paths.map((path) => ({
				path,
				before: `before ${path}\n`,
				after: `after ${path}\n`,
				oldMode: "100644",
				newMode: "100644",
			})),
		);
		expect(
			execFileSync.mock.calls.length,
			"small-file evidence must use bounded Git startup work",
		).toBeLessThanOrEqual(4);
	});

	it("retains NUL-delimited paths, byte-delimited bodies, absent sides and non-blob modes", () => {
		const root = fixture();
		const seed = commitTree(root, []);
		const oldEntries = [
			{ path: "empty.txt", body: "not empty\n" },
			{ path: "deleted.txt", body: "deleted\n" },
			{ path: "renamed.txt", body: "same content\n" },
			{ path: "space 文件.txt", body: "before\r\n\t " },
			{ path: "line\nbreak.txt", body: "old\n" },
			{ path: "deleted\nline.txt", body: "removed\n" },
			{ path: "bytes.bin", body: Buffer.from([0, 10, 255, 195, 169, 10]) },
			{ path: "executable.sh", body: "script\n" },
			{ path: "link", mode: "120000", body: "before target" },
			{ path: "module", mode: "160000", oid: seed },
		];
		const base = commitTree(root, oldEntries, seed);
		const newEntries = [
			{ path: "empty.txt", body: "" },
			{ path: "added.txt", body: "" },
			{ path: "moved.txt", body: "same content\n" },
			{ path: "space 文件.txt", body: "after\r\n\t  " },
			{ path: "line\nbreak.txt", body: "new\n\0payload\n" },
			{ path: "added\nline.txt", body: "new leaf\n" },
			{ path: "bytes.bin", body: Buffer.from([240, 159, 152, 128, 0, 255, 10]) },
			{ path: "executable.sh", mode: "100755", body: "script\n" },
			{ path: "link", mode: "120000", body: "after target\n" },
			{ path: "module", mode: "160000", oid: base },
		];
		const head = commitTree(root, newEntries, base);
		const side = (entries, path) => {
			const entry = entries.find((candidate) => candidate.path === path);
			if (!entry) return { mode: null, body: "" };
			if (entry.mode === "160000") return { mode: "unknown", body: null };
			return { mode: entry.mode ?? "100644", body: Buffer.from(entry.body).toString("utf8") };
		};
		const expected = changedFiles(root, base, head).map((path) => {
			const before = side(oldEntries, path);
			const after = side(newEntries, path);
			return { path, before: before.body, after: after.body, oldMode: before.mode, newMode: after.mode };
		});

		expect(readChanges(root, base, head)).toEqual(expected);
	});

	it("keeps directory replacements unknown and supplies complete safety and design evidence", () => {
		const root = fixture();
		const base = commitTree(root, [
			{ path: "file.txt", body: "leaf\n" },
			{ path: "directory/child.txt", body: "child\n" },
			{ path: "packages/ai/src/action.ts", body: "const enabled = false;\n" },
			{ path: "packages/ai/test/action.test.ts", body: "expect(enabled).toBe(false);\n" },
			{ path: "apps/desktop/src/renderer/panel.css", body: ".panel {}\n" },
		]);
		const head = commitTree(
			root,
			[
				{ path: "file.txt/child.txt", body: "new child\n" },
				{ path: "directory", body: "new leaf\n" },
				{ path: "packages/ai/src/action.ts", body: "fetch('https://fixture.example.invalid');\n" },
				{ path: "packages/ai/test/action.test.ts", body: "expect(true).toBe(true);\n" },
				{ path: "apps/desktop/src/renderer/panel.css", body: ".panel { color: #ff0000; }\n" },
			],
			base,
		);
		const changes = readChanges(root, base, head);

		expect(changes).toEqual(
			expect.arrayContaining([
				{ path: "file.txt", before: "leaf\n", after: null, oldMode: "100644", newMode: "unknown" },
				{ path: "directory", before: null, after: "new leaf\n", oldMode: "unknown", newMode: "100644" },
			]),
		);
		expect(classifyChanges(changes).gates).toEqual(expect.arrayContaining(["security", "tests-and-guards"]));
		expect(auditDesign(changes).findings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ rule: "D01", file: "apps/desktop/src/renderer/panel.css" }),
			]),
		);
	});

	it("reads the current HEAD on every call and rejects unresolved or nonexistent revisions", () => {
		const root = fixture();
		const base = commitTree(root, [{ path: "feature.txt", body: "base\n" }]);
		const first = commitTree(root, [{ path: "feature.txt", body: "first\n" }], base);
		expect(readChanges(root, base)[0].after).toBe("first\n");
		const second = commitTree(root, [{ path: "feature.txt", body: "second\n" }], first);
		expect(readChanges(root, base)[0].after).toBe("second\n");
		expect(readChanges(root, base, first)[0].after).toBe("first\n");
		expect(readChanges(root, second, second)).toEqual([]);
		for (const [before, after] of [
			["main", second],
			[base, "main"],
			["--help", second],
			[base, "HEAD~1"],
		])
			expect(() => readChanges(root, before, after)).toThrow(/resolved commit ids/u);
		expect(() => readChanges(root, "1".repeat(40), second)).toThrow();
	});

	it("keeps sub-limit blobs in separate body batches when their total exceeds 16MiB", () => {
		const root = fixture();
		const limit = 16777216;
		const firstBody = Buffer.alloc(9 * 1024 * 1024, 65);
		const secondBody = Buffer.alloc(9 * 1024 * 1024, 66);
		const base = commitTree(root, []);
		const head = commitTree(
			root,
			[
				{ path: "large-a.txt", body: firstBody },
				{ path: "large-b.txt", body: secondBody },
			],
			base,
		);
		vi.mocked(execFileSync).mockClear();

		const changes = readChanges(root, base, head);
		expect(changes.map(({ path, before, oldMode, newMode }) => ({ path, before, oldMode, newMode }))).toEqual([
			{ path: "large-a.txt", before: "", oldMode: null, newMode: "100644" },
			{ path: "large-b.txt", before: "", oldMode: null, newMode: "100644" },
		]);
		expect(Buffer.from(changes[0].after).equals(firstBody)).toBe(true);
		expect(Buffer.from(changes[1].after).equals(secondBody)).toBe(true);
		const batches = bodyBatches();
		expect(batches, "the combined wire output exceeds one batch budget").toHaveLength(2);
		for (const batch of batches) {
			expect(batch.input.trimEnd().split("\n")).toHaveLength(1);
			expect(batch.bytes).toBeLessThanOrEqual(limit);
			expect(batch.maxBuffer).toBe(limit);
		}
	});

	it("preserves the per-object 16MiB limit with only single-object framing overhead", () => {
		const root = fixture();
		const limit = 16777216;
		const firstBody = Buffer.alloc(limit, 65);
		firstBody.write("😀", limit - 4, "utf8");
		const secondBody = Buffer.alloc(1024 * 1024, 66);
		const base = commitTree(root, [
			{ path: "large-a.txt", body: "" },
			{ path: "large-b.txt", body: "" },
		]);
		const head = commitTree(
			root,
			[
				{ path: "large-a.txt", body: firstBody },
				{ path: "large-b.txt", body: secondBody },
			],
			base,
		);
		vi.mocked(execFileSync).mockClear();
		const changes = readChanges(root, base, head);
		expect(changes.map(({ path, before, oldMode, newMode }) => ({ path, before, oldMode, newMode }))).toEqual([
			{ path: "large-a.txt", before: "", oldMode: "100644", newMode: "100644" },
			{ path: "large-b.txt", before: "", oldMode: "100644", newMode: "100644" },
		]);
		expect(Buffer.from(changes[0].after).equals(firstBody), "all bytes at the blob limit must survive").toBe(true);
		expect(Buffer.from(changes[1].after).equals(secondBody), "subsequent batches must retain all content").toBe(true);
		const batches = bodyBatches();
		const framing = batches.filter(({ maxBuffer }) => maxBuffer > limit);
		expect(framing, "only the exact-limit object may exceed the wire budget").toHaveLength(1);
		expect(framing[0].input.trimEnd().split("\n")).toHaveLength(1);
		expect(framing[0].maxBuffer).toBe(framing[0].bytes);
		expect(framing[0].bytes - limit).toBeLessThanOrEqual(128);
		for (const batch of batches) {
			expect(batch.bytes).toBeLessThanOrEqual(batch.maxBuffer);
			if (batch !== framing[0]) expect(batch.maxBuffer).toBe(limit);
		}
	});

	it("rejects a single blob above the 16MiB content limit", () => {
		const root = fixture();
		const limit = 16777216;
		const head = commitTree(root, []);
		const oversized = commitTree(root, [{ path: "large-a.txt", body: Buffer.alloc(limit + 1, 67) }], head);
		expect(() => readChanges(root, head, oversized)).toThrow(/16MiB/u);
	});

	it.each([
		["truncated diff", "diff", (output) => output.slice(0, -1)],
		["missing blob", "--batch-check", (_output, input) => `${input.toString().split("\0")[0]} missing\n`],
		["wrong object type", "--batch-check", (output) => output.toString().replace(" blob ", " commit ")],
		["wrong object id", "--batch-check", (output) => output.toString().replace(/^[a-f0-9]+/u, "0".repeat(40))],
		["high-bit metadata header", "--batch-check", highBitHeader],
		["high-bit body header", "--batch", highBitHeader],
		["truncated metadata", "--batch-check", (output) => output.subarray(0, -1)],
		["extra metadata", "--batch-check", (output) => Buffer.concat([output, Buffer.from("unexpected\n")])],
		["truncated body", "--batch", (output) => output.subarray(0, -2)],
		["wrong body size", "--batch", (output) => output.toString().replace(" blob 7\n", " blob 8\n")],
		["wrong body id", "--batch", (output) => output.toString().replace(/^[a-f0-9]+/u, "0".repeat(40))],
		["extra body data", "--batch", (output) => Buffer.concat([output, Buffer.from("unexpected\n")])],
	])("fails closed on %s instead of returning partial evidence", (_label, command, corrupt) => {
		const root = fixture();
		const base = commitTree(root, [{ path: "feature.txt", body: "before\n" }]);
		const head = commitTree(root, [{ path: "feature.txt", body: "after\n" }], base);
		let intercepted = false;
		vi.mocked(execFileSync).mockImplementation((program, args, options) => {
			const output = execute(program, args, options);
			if (program !== "git" || !args.includes(command)) return output;
			intercepted = true;
			const result = corrupt(output, options.input);
			return typeof output === "string" ? result.toString() : Buffer.from(result);
		});

		expect(() => readChanges(root, base, head)).toThrow(/Git/u);
		expect(intercepted).toBe(true);
	});

	it("propagates Git process failure without converting it into empty evidence", () => {
		const root = fixture();
		const base = commitTree(root, [{ path: "feature.txt", body: "before\n" }]);
		const head = commitTree(root, [{ path: "feature.txt", body: "after\n" }], base);
		const failure = new Error("fixture Git process failed");
		vi.mocked(execFileSync).mockImplementation((program, args, options) => {
			if (program === "git" && args.includes("cat-file")) throw failure;
			return execute(program, args, options);
		});

		expect(() => readChanges(root, base, head)).toThrow(failure);
	});

	it("accepts a Git root created under the OS temporary directory", () => {
		const root = fixture();
		const head = commitTree(root, [{ path: "feature.txt", body: "base\n" }]);

		expect(snapshot(root, { clean: false }).head).toBe(head);
	});
});
