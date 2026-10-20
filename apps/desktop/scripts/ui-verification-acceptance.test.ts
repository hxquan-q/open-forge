// Copyright The Open Forge contributors.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, expect, it } from "vitest";
import { acceptanceProgram, verifyUiAcceptance } from "./ui-verification-acceptance";

const roots: string[] = [];
it("rejects executable operations and path-like theme output at the Desktop boundary", async () => {
	expect(() => Reflect.apply(acceptanceProgram, undefined, [{ version: 1, steps: [{ action: "eval", selector: "#root" }] }, "/tmp"])).toThrow(/Invalid UI step/);
	const directory = mkdtempSync(join(tmpdir(), "forge-ui-invalid-theme-")); roots.push(directory);
	await expect(verifyUiAcceptance({ plan, reportFile: join(directory, "result.json"), layout: { artifactDir: directory }, runPlaywright: () => ({ status: 0, stdout: `### Result\n${JSON.stringify({ checks: [{ theme: "../../outside", mode: "dark", assertions: 3 }], errors: [] })}` }) })).rejects.toThrow(/Invalid UI theme/);
});
const plan = { version: 1 as const, steps: [{ action: "click" as const, selector: "button[data-test=menu]" }, { action: "text" as const, selector: "nav", value: "Settings" }] };
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }); });
it("executes the fixed user-flow program for six themes with assertions and screenshots", async () => {
	const directory = mkdtempSync(join(tmpdir(), "forge-ui-program-")); roots.push(directory);
	const page = {
		on() {}, off() {},
		locator(selector: string) { return { async waitFor() {}, async click() {}, async innerText() { return selector === "nav" ? "Settings" : ""; } }; },
		async evaluate(_fn: unknown, value?: unknown) { return value ? undefined : { width: 1280, overflow: false }; },
		async screenshot({ path }: { path: string }) { writeFileSync(path, Buffer.from([137,80,78,71,13,10,26,10])); },
	};
	const program = runInNewContext(`(${acceptanceProgram(plan, directory)})`);
	const result = await program(page);
	expect(result.errors).toEqual([]);
	expect(result.checks).toHaveLength(6);
	expect(result.checks.every((check: { assertions: number }) => check.assertions === 4)).toBe(true);
	const accepted = await verifyUiAcceptance({ plan, reportFile: join(directory, "result.json"), layout: { artifactDir: directory }, runPlaywright: () => ({ status: 0, stdout: `### Result\n${JSON.stringify(result)}\n### Ran Playwright code\n...` }) });
	expect(accepted.checks.every((check) => check.screenshot.sha256.length === 64)).toBe(true);
});
it("rejects exit-zero output with no actual acceptance report", async () => {
	const directory = mkdtempSync(join(tmpdir(), "forge-ui-no-assertions-")); roots.push(directory);
	mkdirSync(join(directory, "artifacts"));
	await expect(verifyUiAcceptance({ plan, reportFile: join(directory, "report.json"), layout: { artifactDir: directory }, runPlaywright: () => ({ status: 0, stdout: "Screenshot saved" }) })).rejects.toThrow(/no acceptance/);
});
