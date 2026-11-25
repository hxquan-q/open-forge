// Copyright The Open Forge contributors.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./Initialize-YunxiaoPipelines.ps1", import.meta.url));
const env = { ...process.env };
delete env.ALIBABA_CLOUD_YUNXIAO_ACCESS_TOKEN;

function run(...args) {
	return spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-File", script, ...args], {
		encoding: "utf8",
		env,
		timeout: 30_000,
	});
}

test("self-test remains offline and requires no generated directory", () => {
	const result = run("-SelfTest");
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /SelfTestPassed; no network requests/);
});

test("probe without a generated directory fails before credentials or network", () => {
	const result = run("-Probe");
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /GeneratedDirectory is required/);
	assert.doesNotMatch(result.stderr, /Yunxiao token/);
});

test("an explicitly supplied existing directory reaches the credentials check", () => {
	const result = run("-Probe", "-GeneratedDirectory", tmpdir());
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /Yunxiao token/);
});

test("explicit missing generated directory fails before credentials or network", () => {
	const result = run("-Probe", "-GeneratedDirectory", join(tmpdir(), `openforge-missing-${randomUUID()}`));
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /GeneratedDirectory must be an existing directory/);
	assert.doesNotMatch(result.stderr, /Yunxiao token/);
});
