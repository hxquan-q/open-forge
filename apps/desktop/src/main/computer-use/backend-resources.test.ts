// Copyright The Open Forge contributors.
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import contract from "../../shared/computer-use-backend.json";
import { verifyBackendResources } from "./bundled-backend.js";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "computer-use-resources-"));
	roots.push(root);
	const files: Record<string, string> = {};
	for (const file of contract.requiredFiles) {
		const bytes = Buffer.from(`fixture ${file}`);
		await mkdir(dirname(join(root, file)), { recursive: true });
		await writeFile(join(root, file), bytes);
		files[file] = createHash("sha256").update(bytes).digest("hex");
	}
	const bundle = {
		protocol: contract.protocol,
		platform: contract.platform,
		pythonVersion: contract.pythonVersion,
		fingerprint: "a".repeat(64),
		files,
	};
	const save = () => writeFile(join(root, "bundle.json"), JSON.stringify(bundle));
	await save();
	return { root, bundle, save };
}

describe("runtime computer-use resource contract", () => {
	it("accepts all required modules, native dependencies and licenses", async () => {
		const f = await fixture();
		await expect(verifyBackendResources(f.root)).resolves.toBeUndefined();
	});
	it("rejects a manifest that consistently omits the required native input dependency", async () => {
		const f = await fixture();
		const key = "runtime/Lib/site-packages/uiautomation/bin/UIAutomationClient_VC140_X64.dll";
		delete f.bundle.files[key];
		await f.save();
		await rm(join(f.root, key));
		await expect(verifyBackendResources(f.root)).rejects.toThrow("backend_integrity_failed");
	});
	it("maps missing or corrupt files to the stable integrity error", async () => {
		const f = await fixture();
		await rm(join(f.root, "worker", "executor.py"));
		await expect(verifyBackendResources(f.root)).rejects.toThrow("backend_integrity_failed");
	});
});
