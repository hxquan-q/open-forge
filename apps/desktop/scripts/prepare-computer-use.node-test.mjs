// Copyright The Open Forge contributors.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import AdmZip from "adm-zip";
import { COMPUTER_USE_BUNDLE_CONTRACT, prepareComputerUse, validateArchivePath, verifyComputerUseBundle } from "./prepare-computer-use.mjs";

const roots = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "computer-use-pack-")); roots.push(root);
	const source = join(root, "source");
	await mkdir(join(source, "vendor", "winhands"), { recursive: true });
	for (const name of ["server.py", "executor.py", "windows.py", "input_guard.py"]) await writeFile(join(source, name), "# test worker\n");
	for (const name of ["__init__.py", "uia.py", "inputs.py", "LICENSE"]) await writeFile(join(source, "vendor", "winhands", name), "test primitive\n");
	const zip = new AdmZip();
	for (const name of COMPUTER_USE_BUNDLE_CONTRACT.requiredFiles.filter((file) => file.startsWith("runtime/")).map((file) => file.slice("runtime/".length))) zip.addFile(name, Buffer.from("fixture " + name));
	const archive = zip.toBuffer();
	const manifest = { protocol: 1, platform: "win32-x64", pythonVersion: "3.12.10", archives: [{ id: "python", filename: "python.zip", url: "https://fixture.invalid/python.zip", sha256: createHash("sha256").update(archive).digest("hex"), destination: "runtime" }] };
	await writeFile(join(source, "dependencies.json"), JSON.stringify(manifest));
	const target = join(root, "bundle");
	const options = { platformTag: "win32-x64", source, target, downloadRoot: join(root, "downloads"), fetchImpl: async () => new Response(archive), log: () => {} };
	return { root, source, target, options, archive };
}

test("builds a relocatable verified private runtime without system Python or installation", async () => {
	const f = await fixture();
	assert.equal(await prepareComputerUse(f.options), f.target);
	const bundle = await verifyComputerUseBundle(f.target);
	assert.equal(bundle.platform, "win32-x64");
	const paths = await readFile(join(f.target, "runtime", "python312._pth"), "utf8");
	assert.match(paths, /\.\.\/worker\/vendor/);
	assert.doesNotMatch(paths, /import site|G:|Users|sitecustomize/);
	assert.ok(bundle.files["licenses/WinHands.txt"]);
	assert.ok(bundle.files["runtime/pythonw.exe"]);
});

test("reuses only complete matching bundles and rebuilds after source changes", async () => {
	const f = await fixture(); await prepareComputerUse(f.options);
	let fetches = 0;
	const options = { ...f.options, fetchImpl: async () => { fetches++; throw new Error("must remain offline"); } };
	await prepareComputerUse(options);
	assert.equal(fetches, 0);
	await writeFile(join(f.source, "server.py"), "# changed worker\n");
	await prepareComputerUse(options);
	assert.equal(fetches, 0);
	assert.equal(await readFile(join(f.target, "worker", "server.py"), "utf8"), "# changed worker\n");
});

test("blocks damaged or extra bundle files instead of shipping a partial feature", async () => {
	const f = await fixture(); await prepareComputerUse(f.options);
	await writeFile(join(f.target, "runtime", "python.exe"), "changed");
	await assert.rejects(verifyComputerUseBundle(f.target), /integrity mismatch/);
	await prepareComputerUse(f.options);
	await writeFile(join(f.target, "unexpected.py"), "not trusted");
	await assert.rejects(verifyComputerUseBundle(f.target), /unexpected/);
});

test("rejects a self-consistent manifest that omits a required native dependency", async () => {
	const f = await fixture(); await prepareComputerUse(f.options);
	const path = join(f.target, "bundle.json");
	const bundle = JSON.parse(await readFile(path, "utf8"));
	const missing = "runtime/Lib/site-packages/uiautomation/bin/UIAutomationClient_VC140_X64.dll";
	delete bundle.files[missing];
	await rm(join(f.target, missing));
	await writeFile(path, JSON.stringify(bundle));
	await assert.rejects(verifyComputerUseBundle(f.target), /bundle missing/);
});

test("does not prepare Windows dependencies on other platforms", async () => {
	let fetched = false;
	assert.equal(await prepareComputerUse({ platformTag: "darwin-arm64", fetchImpl: async () => { fetched = true; throw new Error(); } }), null);
	assert.equal(fetched, false);
});

test("rejects corrupt downloads and unsafe archive paths", async () => {
	const f = await fixture();
	await assert.rejects(prepareComputerUse({ ...f.options, fetchImpl: async () => new Response("corrupt") }), /integrity mismatch/);
	for (const path of ["../outside", "/absolute", "C:/absolute", "dir\\escape", "dir/../escape"]) assert.throws(() => validateArchivePath(path), /Unsafe/);
});
