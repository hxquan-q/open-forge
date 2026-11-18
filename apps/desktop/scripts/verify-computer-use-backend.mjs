// Copyright The Open Forge contributors.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { StdioMcpClient } from "@vetta/runtime-node/mcp";
import { COMPUTER_USE_BUNDLE_CONTRACT, prepareComputerUse, verifyComputerUseBundle } from "./prepare-computer-use.mjs";

if (process.platform !== "win32" || process.arch !== "x64") {
	console.log("[computer-use] runtime smoke skipped: Windows x64 only");
} else {
	const root = await prepareComputerUse();
	await verifyComputerUseBundle(root);
	const temp = resolve(import.meta.dirname, "../../../.tmp");
	await mkdir(temp, { recursive: true });
	const cache = await mkdtemp(join(temp, "computer-use-smoke-"));
	const command = join(root, "runtime", "pythonw.exe");
	const script = join(root, "worker", "server.py");
	const client = new StdioMcpClient({ name: "computer-use-smoke", timeout: 10_000, config: { command, args: ["-I", "-B", script, "--cache", cache], cwd: cache } });
	try {
		const test = await promisify(execFile)(command, ["-I", "-B", script, "--self-test", "--cache", cache], { cwd: cache, windowsHide: true });
		const dependencyState = JSON.parse(test.stdout);
		assert.equal(dependencyState.ok, true);
		assert.equal(dependencyState.python, COMPUTER_USE_BUNDLE_CONTRACT.pythonVersion);
		const initialized = await client.initialize({ protocolVersion: "2024-11-05", clientInfo: { name: "computer-use-smoke", version: "1" }, capabilities: {} });
		assert.equal(initialized.serverInfo.name, "vetta-computer-use");
		// Reject before any window enumeration, UIA observation, screenshot or input.
		const denied = await client.callTool("computer_action", { op: "not-a-desktop-operation" });
		assert.equal(denied.content[0].type, "text");
		assert.deepEqual(JSON.parse(denied.content[0].text), { ok: false, code: "invalid_input" });
		const stopped = await client.callTool("stop", {});
		assert.deepEqual(JSON.parse(stopped.content[0].text), { ok: true });
		console.log("[computer-use] bundled runtime imports, private MCP handshake, rejection and stop passed; no desktop accessed");
	} finally {
		await client.close();
		await rm(cache, { recursive: true, force: true });
	}
}
