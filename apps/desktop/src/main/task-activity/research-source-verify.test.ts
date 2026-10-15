// Copyright The Open Forge contributors.
import { mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { formatResearchSourcesManifest } from "@vetta/coding-agent/function-extensions";
import { afterEach, describe, expect, it } from "vitest";
import { verifyResearchSourcesFromContent } from "./research-source-verify.js";

const dirs: string[] = [];
function tempRoot(): string {
	const dir = mkdtempSync(join(tmpdir(), "research-verify-"));
	dirs.push(dir);
	return dir;
}
afterEach(() => {
	while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("verifyResearchSourcesFromContent", () => {
	it("无引用清单的旧产物 → no-manifest，不误报", async () => {
		expect(await verifyResearchSourcesFromContent("# 普通产物\n无围栏块")).toEqual({ status: "no-manifest" });
	});

	it("逐项给出 ok/changed/missing，单源缺失不拖垮整体", async () => {
		const root = tempRoot();
		const keep = join(root, "keep.md");
		writeFileSync(keep, "same");
		const touched = join(root, "touched.md");
		writeFileSync(touched, "same");
		const future = new Date(Date.now() + 60_000);
		utimesSync(touched, future, future);
		const missing = join(root, "gone.md");
		const manifest = formatResearchSourcesManifest({
			version: 1,
			root,
			sources: [
				{
					uri: pathToFileURL(keep).href,
					path: keep,
					name: "keep.md",
					sizeBytes: 4,
					modifiedAtMs: statSync(keep).mtimeMs,
				},
				{
					uri: pathToFileURL(touched).href,
					path: touched,
					name: "touched.md",
					sizeBytes: 4,
					modifiedAtMs: statSync(keep).mtimeMs,
				},
				{ uri: pathToFileURL(missing).href, path: missing, sizeBytes: 1, modifiedAtMs: 0 },
			],
		});
		const result = await verifyResearchSourcesFromContent(`# 结论\n正文\n\n${manifest}`);
		expect(result.status).toBe("ok");
		if (result.status !== "ok") return;
		expect(result.sources.map((s) => s.status)).toEqual(["ok", "changed", "missing"]);
		expect(result.sources[0]!.name).toBe("keep.md");
		expect(result.sources[0]!.uri).toBe(pathToFileURL(keep).href);
	});
});
