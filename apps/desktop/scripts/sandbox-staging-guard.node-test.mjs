// Modified by The Open Forge contributors.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	classifySandboxSource,
	collectMissingSandboxBinaries,
	formatSandboxStagingWarning,
} from "./sandbox-staging-guard.mjs";

function createFixture() {
	const root = mkdtempSync(join(tmpdir(), "of-sandbox-staging-"));
	return {
		root,
		missingDir: join(root, "does-not-exist"),
		emptyDir: join(root, "empty"),
		presentDir: join(root, "present"),
		cleanup: () => rmSync(root, { recursive: true, force: true }),
	};
}

test("来源目录判定区分不存在 / 为空 / 有条目", () => {
	const fixture = createFixture();
	try {
		mkdirSync(fixture.emptyDir);
		mkdirSync(fixture.presentDir);
		writeFileSync(join(fixture.presentDir, "codex-windows-sandbox-host.exe"), "binary");

		assert.equal(classifySandboxSource(fixture.missingDir), "missing");
		assert.equal(classifySandboxSource(fixture.emptyDir), "empty");
		assert.equal(classifySandboxSource(fixture.presentDir), "present");
	} finally {
		fixture.cleanup();
	}
});

test("声明打包 Windows 但没有沙盒二进制时给出告警（当前仓库的实际状态）", () => {
	const fixture = createFixture();
	try {
		const missing = collectMissingSandboxBinaries({
			declaredFamilies: ["win32"],
			sourceDirs: { win32: fixture.missingDir },
		});

		assert.equal(missing.length, 1);
		const [warning] = missing;
		assert.equal(warning.family, "win32");
		assert.equal(warning.state, "missing");

		const message = formatSandboxStagingWarning(warning);
		// 告警必须说清：哪个平台、来源目录在哪、产物会缺什么。
		assert.match(message, /^\[prepare-pack\] /);
		assert.match(message, /Windows/);
		assert.match(message, new RegExp(warning.sourceDir.replace(/\\/g, "\\\\")));
		assert.match(message, /Resources\/sandbox\/windows\//);
		assert.match(message, /sandbox\.status=unavailable/);
	} finally {
		fixture.cleanup();
	}
});

test("来源目录存在但为空同样告警，并且措辞区分「为空」与「不存在」", () => {
	const fixture = createFixture();
	try {
		mkdirSync(fixture.emptyDir);
		const [emptyCase] = collectMissingSandboxBinaries({
			declaredFamilies: ["linux"],
			sourceDirs: { linux: fixture.emptyDir },
		});
		assert.equal(emptyCase.state, "empty");
		assert.match(formatSandboxStagingWarning(emptyCase), /来源目录为空/);

		const [missingCase] = collectMissingSandboxBinaries({
			declaredFamilies: ["linux"],
			sourceDirs: { linux: fixture.missingDir },
		});
		assert.equal(missingCase.state, "missing");
		assert.match(formatSandboxStagingWarning(missingCase), /来源目录不存在/);
	} finally {
		fixture.cleanup();
	}
});

test("staged 了二进制就不再告警", () => {
	const fixture = createFixture();
	try {
		mkdirSync(fixture.presentDir);
		writeFileSync(join(fixture.presentDir, "codex-windows-sandbox-host.exe"), "binary");

		const missing = collectMissingSandboxBinaries({
			declaredFamilies: ["win32", "linux"],
			sourceDirs: { win32: fixture.presentDir, linux: fixture.presentDir },
		});

		assert.deepEqual(missing, []);
	} finally {
		fixture.cleanup();
	}
});

test("只对本次声明要打包的平台告警：darwin 与未声明平台不参与", () => {
	const fixture = createFixture();
	try {
		// 未声明 win32（例如只打 macOS / Linux 包）时，不该因为没有 Windows host 而告警。
		const darwinOnly = collectMissingSandboxBinaries({
			declaredFamilies: ["darwin"],
			sourceDirs: { win32: fixture.missingDir, linux: fixture.missingDir },
		});
		assert.deepEqual(darwinOnly, []);

		const multiple = collectMissingSandboxBinaries({
			declaredFamilies: ["darwin", "linux", "win32"],
			sourceDirs: { win32: fixture.missingDir, linux: fixture.emptyDir },
		});
		assert.deepEqual(
			multiple.map((entry) => entry.family),
			["linux", "win32"],
		);
	} finally {
		fixture.cleanup();
	}
});

test("调用方没给来源目录时回退到仓库内约定路径，仍然报出可行动的告警", () => {
	const missing = collectMissingSandboxBinaries({ declaredFamilies: ["win32"] });

	assert.equal(missing.length, 1);
	assert.equal(missing[0].sourceDir, "packages/runtime-core/sandbox/bin");
	assert.match(formatSandboxStagingWarning(missing[0]), /packages\/runtime-core\/sandbox\/bin/);
});
