import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	boundaryImportProblems,
	extractBoundaryFromMarkdown,
	moduleSourceFiles,
	parseBoundaryYaml,
	renderDependents,
	scanContextBoundaries,
} from "./context-boundary-lib.mjs";

let root;

function write(relativePath, content) {
	const path = join(root, relativePath);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content, "utf8");
}

function writePackage(dir, name) {
	write(`${dir}/package.json`, JSON.stringify({ name }));
}

function boundaryBlock(deps = []) {
	const list = deps.length === 0 ? "  []" : `\n${deps.map((dep) => `  - "${dep}"`).join("\n")}`;
	return `\n## Context Boundary\n\n\`\`\`yaml\npurpose: test module\nprovides: []\nconsumes: []\ninternal_dependencies:${list}\n\`\`\`\n`;
}

function setupModules({ aDeps = [], bDeps = [] } = {}) {
	write("package.json", JSON.stringify({ workspaces: ["packages/*"] }));
	writePackage("packages/alpha", "@vetta/alpha");
	writePackage("packages/beta", "@vetta/beta");
	write("packages/alpha/README.md", `# alpha\n${boundaryBlock(aDeps)}`);
	write("packages/beta/README.md", `# beta\n${boundaryBlock(bDeps)}`);
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "context-boundary-"));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe("context boundary yaml parsing", () => {
	it("accepts dash and inline list forms", () => {
		const dash = parseBoundaryYaml(
			'purpose: p\nprovides:\n  - a\n  - "b"\nconsumes: []\ninternal_dependencies: ["@vetta/x", @vetta/y]\n',
		);
		expect(dash.error).toBeNull();
		expect(dash.fields).toEqual({
			purpose: "p",
			provides: ["a", "b"],
			consumes: [],
			internal_dependencies: ["@vetta/x", "@vetta/y"],
		});
	});

	it("rejects unknown keys and non-list list fields", () => {
		expect(parseBoundaryYaml("purpose: x\nbogus: 1\n").error).toContain("unknown key: bogus");
		expect(parseBoundaryYaml("purpose: x\nprovides: single\n").error).toContain("provides must be a list");
	});
});

describe("context boundary extraction", () => {
	it("finds the fenced block after the heading", () => {
		const found = extractBoundaryFromMarkdown(`# pkg\n${boundaryBlock()}`);
		expect(found.found).toBe(true);
		expect(found.fields?.purpose).toBe("test module");
	});

	it("reports a heading without a yaml fence", () => {
		const found = extractBoundaryFromMarkdown("# pkg\n\n## Context Boundary\n\nsome text\n");
		expect(found.error).toContain("yaml fenced block");
	});
});

describe("boundary arch test", () => {
	it("flags undeclared cross-package imports and passes declared ones", () => {
		setupModules({ aDeps: ["@vetta/beta"] });
		write("packages/alpha/src/ok.ts", 'import { b } from "@vetta/beta";\n');
		write("packages/alpha/src/bad.ts", 'import { c } from "@vetta/beta/protocol";\n');
		writePackage("packages/gamma", "@vetta/gamma");
		write("packages/gamma/README.md", `# gamma\n${boundaryBlock()}`);
		write("packages/alpha/src/bad2.ts", 'import { g } from "@vetta/gamma";\n');
		const problems = boundaryImportProblems(root);
		expect(problems.filter((p) => p.includes("internal_dependencies"))).toHaveLength(1);
		expect(problems.join("\n")).toContain("bad2.ts: @vetta/gamma imports @vetta/gamma");
		expect(problems.join("\n")).not.toContain("ok.ts");
	});

	it("flags relative escapes and src deep links regardless of the whitelist", () => {
		setupModules({ aDeps: ["@vetta/beta"] });
		write("packages/alpha/src/escape.ts", 'import { x } from "../../beta/src/x";\n');
		write("packages/alpha/src/deep.ts", 'import { y } from "@vetta/beta/src/y";\n');
		const problems = boundaryImportProblems(root).join("\n");
		expect(problems).toContain("escape.ts: relative import ../../beta/src/x escapes the module root");
		expect(problems).toContain("deep.ts: deep link @vetta/beta/src/y bypasses @vetta/beta exports");
	});

	it("requires a declaration block and a valid whitelist entry", () => {
		setupModules();
		writePackage("packages/orphan", "@vetta/orphan");
		const problems = boundaryImportProblems(root).join("\n");
		expect(problems).toContain("packages/orphan: missing README.md");
		write("packages/orphan/README.md", `# orphan\n${boundaryBlock(["@vetta/not-real"])}`);
		expect(boundaryImportProblems(root).join("\n")).toContain("@vetta/not-real is not a workspace package name");
	});
});

describe("dependents view", () => {
	it("renders the reverse dependency direction", () => {
		setupModules({ aDeps: ["@vetta/beta"] });
		write("packages/alpha/src/ok.ts", 'import { b } from "@vetta/beta";\n');
		const { modules, imports } = scanContextBoundaries(root);
		const md = renderDependents(modules, imports);
		expect(md).toContain("| `@vetta/beta` | `@vetta/alpha` |");
		expect(md).toContain("| `@vetta/alpha` | — |");
	});
});

describe("module source ownership", () => {
	it("excludes files owned by nested workspace modules", () => {
		write("package.json", JSON.stringify({ workspaces: ["packages/*", "packages/host/examples/*"] }));
		writePackage("packages/host", "@vetta/host");
		writePackage("packages/host/examples/demo", "demo-ext");
		write("packages/host/examples/demo/src/index.ts", "export const x = 1;\n");
		const { modules } = scanContextBoundaries(root);
		const files = moduleSourceFiles(root, modules, "packages/host");
		expect(files.some((file) => file.includes("examples/demo"))).toBe(false);
	});
});
