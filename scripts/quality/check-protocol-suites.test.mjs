import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findProtocolSuiteProblems } from "./check-protocol-suites.mjs";

let root;

function write(path, content) {
	const file = join(root, path);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content, "utf8");
}

function registry(protocols) {
	write("tests/contracts/protocol-registry.json", JSON.stringify({ protocols }, null, 2));
}

function owners(text) {
	write("tests/contracts/OWNERS", text);
}

const SUITE = { id: "proto-a", suites: ["pkg/test/a.test.ts"] };

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "protocol-suites-"));
	write("pkg/test/a.test.ts", "// suite\n");
	owners("# format: <id>  <owner>  <reason>\n");
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("protocol suite guard", () => {
	it("passes when every protocol names an existing suite", () => {
		registry([SUITE]);
		expect(findProtocolSuiteProblems(root)).toEqual([]);
	});

	it("fails a protocol with no suite and no exemption", () => {
		registry([SUITE, { id: "proto-b", suites: [] }]);
		const problems = findProtocolSuiteProblems(root).join("\n");
		expect(problems).toContain("proto-b: no conformance suite and not exempt");
	});

	it("fails a protocol whose suite file does not exist", () => {
		registry([{ id: "proto-a", suites: ["pkg/test/missing.test.ts"] }]);
		expect(findProtocolSuiteProblems(root).join("\n")).toContain("suite file missing");
	});

	it("accepts a baseline exemption with an OWNERS approver", () => {
		registry([SUITE, { id: "proto-b", suites: [] }]);
		owners("proto-b\tpackages/foo\tgrandfathered gap\n");
		expect(findProtocolSuiteProblems(root, { exempt: ["proto-b"], baseline: ["proto-b"] })).toEqual([]);
	});

	it("rejects an exemption that expands the baseline", () => {
		registry([SUITE, { id: "proto-b", suites: [] }]);
		owners("proto-b\tpackages/foo\tlate exemption\n");
		const problems = findProtocolSuiteProblems(root, { exempt: ["proto-b"], baseline: [] }).join("\n");
		expect(problems).toContain("expands the exemption set");
	});

	it("rejects an exemption without an OWNERS approver", () => {
		registry([SUITE, { id: "proto-b", suites: [] }]);
		expect(findProtocolSuiteProblems(root, { exempt: ["proto-b"], baseline: ["proto-b"] }).join("\n")).toContain(
			"no approver",
		);
	});

	it("rejects a stale exemption once a suite exists", () => {
		registry([SUITE]);
		expect(findProtocolSuiteProblems(root, { exempt: ["proto-a"], baseline: ["proto-a"] }).join("\n")).toContain(
			"still exempt",
		);
	});
});
