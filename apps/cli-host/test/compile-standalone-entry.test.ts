// Modified by The Open Forge contributors.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const standaloneEntrySource = readFileSync(new URL("../scripts/compile-standalone-entry.mjs", import.meta.url), "utf8");

describe("standalone CLI HTML export wiring", () => {
	it("generates resolvable Photon imports from a clean installation for both entrypoints", () => {
		const moduleUrl = new URL("../scripts/compile-standalone-entry.mjs", import.meta.url);
		for (const entry of ["agent", "cli"]) {
			const generated = execFileSync(
				process.execPath,
				[
					"--input-type=module",
					"-e",
					`import {createStandaloneEntry} from ${JSON.stringify(pathToFileURL(fileURLToPath(moduleUrl)).href)};console.log(createStandaloneEntry(${JSON.stringify(entry)}));`,
				],
				{ encoding: "utf8", windowsHide: true },
			);
			const imports = [...generated.matchAll(/"([^"\n]+photon_rs(?:_bg\.wasm|\.js))"/gu)];
			expect(imports).toHaveLength(2);
			for (const [, specifier] of imports) {
				const imported = new URL(
					specifier,
					new URL("../.standalone-entry-fixture/standalone-entry.mjs", import.meta.url),
				);
				expect(() => readFileSync(imported)).not.toThrow();
			}
		}
	});
	it("injects file adapters so compiled --export can read and write sessions", () => {
		expect(standaloneEntrySource).toContain("createCodingAgentHtmlExportRuntime({");
		expect(standaloneEntrySource).toContain("writeFileSync(outputPath, html");
		expect(standaloneEntrySource).toContain("exists: existsSync");
		expect(standaloneEntrySource).toContain("parseCodingAgentHistoricalSessionDocument(readFileSync(path");
		expect(standaloneEntrySource).not.toContain(
			"createCodingAgentHtmlExportRuntime({ assets: { template, css, js, markedJs, highlightJs } })",
		);
	});
});
