import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findWaiverProblems } from "./check-waivers.mjs";

let root;

function waiver(fields, name = "WAIVER-0001-sample.md") {
	const path = join(root, "project/decisions/waivers", name);
	mkdirSync(dirname(path), { recursive: true });
	const fm = Object.entries(fields)
		.filter(([, value]) => value !== undefined)
		.map(([key, value]) => `${key}: ${value}`)
		.join("\n");
	writeFileSync(path, `---\n${fm}\n---\n# waiver\n`, "utf8");
}

const VALID = {
	id: "WAIVER-0001",
	rule: "some rule",
	status: "active",
	owner: "apps/desktop",
	reason: "debt",
	risk: "drift",
	compensation: "new code complies",
	created: "2026-09-24",
	expires: "2026-12-31",
};

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "waivers-"));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("waiver guard", () => {
	it("passes an active waiver before its expiry", () => {
		waiver(VALID);
		expect(findWaiverProblems(root, "2026-10-01")).toEqual([]);
	});

	it("fails an active waiver once expired", () => {
		waiver(VALID);
		const problems = findWaiverProblems(root, "2027-01-01").join("\n");
		expect(problems).toContain("waiver expired on 2026-12-31");
	});

	it("does not fail resolved or revoked waivers past expiry", () => {
		waiver({ ...VALID, status: "resolved" });
		waiver({ ...VALID, id: "WAIVER-0002", status: "revoked" }, "WAIVER-0002-other.md");
		expect(findWaiverProblems(root, "2027-01-01")).toEqual([]);
	});

	it("rejects missing fields, bad status and wrong file names", () => {
		waiver({ ...VALID, expires: undefined, status: "maybe" }, "WAIVER-0099-wrong.md");
		const problems = findWaiverProblems(root, "2026-10-01").join("\n");
		expect(problems).toContain("missing required field expires");
		expect(problems).toContain("status maybe must be one of");
		expect(problems).toContain("file name must start with its id");
	});

	it("rejects duplicate ids", () => {
		waiver(VALID);
		waiver(VALID, "WAIVER-0001-duplicate.md");
		expect(findWaiverProblems(root, "2026-10-01").join("\n")).toContain("duplicate waiver id WAIVER-0001");
	});
});
