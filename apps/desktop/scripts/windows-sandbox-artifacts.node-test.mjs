// Modified by The Open Forge contributors.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { classifySandboxSource, collectMissingSandboxBinaries } from "./sandbox-staging-guard.mjs";
import {
	assessWindowsSandboxArtifacts,
	parseWindowsSandboxArtifactManifest,
	resolveWindowsSandboxArtifactEnforcement,
	sha256OfFile,
	verifyWindowsSandboxArtifacts,
	WINDOWS_SANDBOX_ARTIFACT_BINARIES,
	WINDOWS_SANDBOX_ARTIFACT_SKIP_ENV,
	writeWindowsSandboxArtifactManifest,
} from "./windows-sandbox-artifacts.mjs";

const SOURCE_COMMIT = "0110b9f41e1c841210dc7019e6da4050f029436c";

function createFixture() {
	const root = mkdtempSync(join(tmpdir(), "of-windows-sandbox-artifacts-"));
	const sourceDir = join(root, "bin");
	const manifestPath = join(root, "sandbox-artifacts.json");
	mkdirSync(sourceDir, { recursive: true });
	return {
		root,
		sourceDir,
		manifestPath,
		/** 用真实字节写出一批受控制品。 */
		stageArtifacts(contents = {}) {
			for (const name of WINDOWS_SANDBOX_ARTIFACT_BINARIES) {
				writeFileSync(join(sourceDir, name), contents[name] ?? `bytes-of-${name}`);
			}
		},
		manifestText(overrides = {}) {
			return JSON.stringify({
				platform: "win32",
				sourceCommit: SOURCE_COMMIT,
				binaries: WINDOWS_SANDBOX_ARTIFACT_BINARIES.map((name) => ({
					name,
					sha256: sha256OfFile(join(sourceDir, name)),
				})),
				...overrides,
			});
		},
		cleanup() {
			rmSync(root, { recursive: true, force: true });
		},
	};
}

test("合法清单解析通过，并保留来源提交与摘要", () => {
	const fixture = createFixture();
	try {
		fixture.stageArtifacts();
		const parsed = parseWindowsSandboxArtifactManifest(fixture.manifestText());

		assert.equal(parsed.ok, true);
		assert.equal(parsed.manifest.sourceCommit, SOURCE_COMMIT);
		assert.deepEqual(
			parsed.manifest.binaries.map((entry) => entry.name),
			WINDOWS_SANDBOX_ARTIFACT_BINARIES,
		);
	} finally {
		fixture.cleanup();
	}
});

test("清单结构 fail-closed：非法 JSON、缺制品、未受控制品、坏摘要都要报出", () => {
	assert.equal(parseWindowsSandboxArtifactManifest("{").ok, false);
	assert.equal(parseWindowsSandboxArtifactManifest("[]").ok, false);

	const fixture = createFixture();
	try {
		const missing = parseWindowsSandboxArtifactManifest(
			JSON.stringify({
				platform: "win32",
				sourceCommit: SOURCE_COMMIT,
				binaries: [{ name: WINDOWS_SANDBOX_ARTIFACT_BINARIES[0], sha256: null }],
			}),
		);
		assert.equal(missing.ok, false);
		assert.match(missing.problems.join("\n"), /清单缺少受控制品 codex-windows-sandbox-setup\.exe/);

		const unexpected = parseWindowsSandboxArtifactManifest(
			JSON.stringify({
				platform: "win32",
				sourceCommit: SOURCE_COMMIT,
				binaries: [
					...WINDOWS_SANDBOX_ARTIFACT_BINARIES.map((name) => ({ name, sha256: null })),
					{ name: "helper.exe", sha256: null },
				],
			}),
		);
		assert.equal(unexpected.ok, false);
		assert.match(unexpected.problems.join("\n"), /清单包含未受控制品 helper\.exe/);

		const wrongPlatform = parseWindowsSandboxArtifactManifest(
			JSON.stringify({ platform: "linux", sourceCommit: SOURCE_COMMIT, binaries: [] }),
		);
		assert.equal(wrongPlatform.ok, false);
		assert.match(wrongPlatform.problems.join("\n"), /platform 必须是 "win32"/);

		const badDigest = parseWindowsSandboxArtifactManifest(
			JSON.stringify({
				platform: "win32",
				sourceCommit: SOURCE_COMMIT,
				binaries: WINDOWS_SANDBOX_ARTIFACT_BINARIES.map((name) => ({ name, sha256: "ABC" })),
			}),
		);
		assert.equal(badDigest.ok, false);
		assert.match(badDigest.problems.join("\n"), /sha256 必须是 64 位小写十六进制摘要/);
	} finally {
		fixture.cleanup();
	}
});


test("制品校验：齐全且摘要一致时通过", () => {
	const fixture = createFixture();
	try {
		fixture.stageArtifacts();
		const parsed = parseWindowsSandboxArtifactManifest(fixture.manifestText());
		assert.equal(parsed.ok, true);
		assert.deepEqual(verifyWindowsSandboxArtifacts({ manifest: parsed.manifest, sourceDir: fixture.sourceDir }), []);
	} finally {
		fixture.cleanup();
	}
});

test("制品校验：某半个制品缺失就报出文件名（目录非空不再等于「有沙盒」）", () => {
	const fixture = createFixture();
	try {
		fixture.stageArtifacts();
		const parsed = parseWindowsSandboxArtifactManifest(fixture.manifestText());
		rmSync(join(fixture.sourceDir, WINDOWS_SANDBOX_ARTIFACT_BINARIES[1]));
		// 目录里仍有其它文件：旧实现（非空即视为存在）会放行，这里必须拦下。
		assert.equal(readFileSync(join(fixture.sourceDir, WINDOWS_SANDBOX_ARTIFACT_BINARIES[0]), "utf8").length > 0, true);

		const problems = verifyWindowsSandboxArtifacts({ manifest: parsed.manifest, sourceDir: fixture.sourceDir });
		assert.equal(problems.length, 1);
		assert.match(problems[0], /缺少受控制品 codex-windows-sandbox-setup\.exe/);
	} finally {
		fixture.cleanup();
	}
});

test("制品校验：字节被替换时摘要不一致必须拦下并给出两侧摘要", () => {
	const fixture = createFixture();
	try {
		fixture.stageArtifacts();
		const parsed = parseWindowsSandboxArtifactManifest(fixture.manifestText());
		const target = join(fixture.sourceDir, WINDOWS_SANDBOX_ARTIFACT_BINARIES[0]);
		writeFileSync(target, "tampered-payload");
		const expected = parsed.manifest.binaries[0].sha256;

		const problems = verifyWindowsSandboxArtifacts({ manifest: parsed.manifest, sourceDir: fixture.sourceDir });
		assert.equal(problems.length, 1);
		assert.match(problems[0], /摘要不一致/);
		assert.match(problems[0], new RegExp(expected));
		assert.match(problems[0], new RegExp(sha256OfFile(target)));
	} finally {
		fixture.cleanup();
	}
});

test("制品校验：未受控文件混入来源目录同样报出", () => {
	const fixture = createFixture();
	try {
		fixture.stageArtifacts();
		const parsed = parseWindowsSandboxArtifactManifest(fixture.manifestText());
		writeFileSync(join(fixture.sourceDir, "extra.dll"), "not-listed");

		const problems = verifyWindowsSandboxArtifacts({ manifest: parsed.manifest, sourceDir: fixture.sourceDir });
		assert.equal(problems.length, 1);
		assert.match(problems[0], /未受控文件 extra\.dll/);
	} finally {
		fixture.cleanup();
	}
});

test("制品校验：未钉摘要（sha256 为 null）不能当作通过", () => {
	const fixture = createFixture();
	try {
		fixture.stageArtifacts();
		const parsed = parseWindowsSandboxArtifactManifest(
			JSON.stringify({
				platform: "win32",
				sourceCommit: null,
				binaries: WINDOWS_SANDBOX_ARTIFACT_BINARIES.map((name) => ({ name, sha256: null })),
			}),
		);
		assert.equal(parsed.ok, true);

		const problems = verifyWindowsSandboxArtifacts({ manifest: parsed.manifest, sourceDir: fixture.sourceDir });
		// 未记录来源提交 1 条 + 3 个未钉摘要。
		assert.equal(problems.length, 4);
		assert.match(problems.join("\n"), /无法追溯这批制品来自哪次受控构建/);
		assert.match(problems.join("\n"), /codex-windows-sandbox-host\.exe 尚未钉摘要/);
	} finally {
		fixture.cleanup();
	}
});

test("assess：未声明 Windows 时不读清单也不阻断", () => {
	const fixture = createFixture();
	try {
		const assessment = assessWindowsSandboxArtifacts({
			declaredFamilies: ["darwin"],
			manifestPath: join(fixture.root, "absent.json"),
			sourceDir: fixture.sourceDir,
		});
		assert.equal(assessment.status, "not-declared");
		assert.equal(assessment.message, null);
	} finally {
		fixture.cleanup();
	}
});

test("assess：声明 Windows 但清单缺失时阻断，并给出可行动的修复步骤", () => {
	const fixture = createFixture();
	try {
		const assessment = assessWindowsSandboxArtifacts({
			declaredFamilies: ["win32"],
			manifestPath: join(fixture.root, "absent.json"),
			sourceDir: fixture.sourceDir,
			env: {},
		});
		assert.equal(assessment.status, "blocked");
		assert.equal(assessment.enforcement, "block");
		assert.match(assessment.message, /受控清单不存在/);
		assert.match(assessment.message, /--write --source-dir/);
		assert.match(assessment.message, new RegExp(WINDOWS_SANDBOX_ARTIFACT_SKIP_ENV));
	} finally {
		fixture.cleanup();
	}
});

test("assess：默认阻断；显式设置跳过变量后降级为告警", () => {
	assert.equal(resolveWindowsSandboxArtifactEnforcement({}), "block");
	assert.equal(resolveWindowsSandboxArtifactEnforcement({ [WINDOWS_SANDBOX_ARTIFACT_SKIP_ENV]: "0" }), "block");
	assert.equal(resolveWindowsSandboxArtifactEnforcement({ [WINDOWS_SANDBOX_ARTIFACT_SKIP_ENV]: "1" }), "warn");

	const fixture = createFixture();
	try {
		const downgraded = assessWindowsSandboxArtifacts({
			declaredFamilies: ["win32"],
			manifestPath: join(fixture.root, "absent.json"),
			sourceDir: fixture.sourceDir,
			env: { [WINDOWS_SANDBOX_ARTIFACT_SKIP_ENV]: "1" },
		});
		assert.equal(downgraded.status, "blocked");
		assert.equal(downgraded.enforcement, "warn");
		assert.notEqual(downgraded.message, null);
	} finally {
		fixture.cleanup();
	}
});

test("assess：清单校验通过才算 ok（真实摘要闭环）", () => {
	const fixture = createFixture();
	try {
		fixture.stageArtifacts();
		const written = writeWindowsSandboxArtifactManifest({
			manifestPath: fixture.manifestPath,
			sourceDir: fixture.sourceDir,
			sourceCommit: SOURCE_COMMIT,
		});
		assert.equal(written.ok, true);

		const assessment = assessWindowsSandboxArtifacts({
			declaredFamilies: ["win32"],
			manifestPath: fixture.manifestPath,
			sourceDir: fixture.sourceDir,
			env: {},
		});
		assert.deepEqual(assessment, { status: "ok", enforcement: "block", message: null });
	} finally {
		fixture.cleanup();
	}
});

test("assess：制品字节在钉摘要之后被替换，打包必须被阻断", () => {
	const fixture = createFixture();
	try {
		fixture.stageArtifacts();
		writeWindowsSandboxArtifactManifest({
			manifestPath: fixture.manifestPath,
			sourceDir: fixture.sourceDir,
			sourceCommit: SOURCE_COMMIT,
		});
		writeFileSync(join(fixture.sourceDir, WINDOWS_SANDBOX_ARTIFACT_BINARIES[2]), "swapped");

		const assessment = assessWindowsSandboxArtifacts({
			declaredFamilies: ["win32"],
			manifestPath: fixture.manifestPath,
			sourceDir: fixture.sourceDir,
			env: {},
		});
		assert.equal(assessment.status, "blocked");
		assert.match(assessment.message, /codex-command-runner\.exe 摘要不一致/);
	} finally {
		fixture.cleanup();
	}
});

test("write：缺少受控制品或来源提交非法时拒绝生成清单", () => {
	const fixture = createFixture();
	try {
		const missingArtifacts = writeWindowsSandboxArtifactManifest({
			manifestPath: fixture.manifestPath,
			sourceDir: fixture.sourceDir,
			sourceCommit: SOURCE_COMMIT,
		});
		assert.equal(missingArtifacts.ok, false);
		assert.match(missingArtifacts.problems.join("\n"), /缺少受控制品/);

		fixture.stageArtifacts();
		const badCommit = writeWindowsSandboxArtifactManifest({
			manifestPath: fixture.manifestPath,
			sourceDir: fixture.sourceDir,
			sourceCommit: "HEAD",
		});
		assert.equal(badCommit.ok, false);
		assert.match(badCommit.problems.join("\n"), /40 位小写十六进制提交号/);
	} finally {
		fixture.cleanup();
	}
});


test("对照旧判定：目录非空即视为「有沙盒」，新清单校验不会放行半个制品", () => {
	const fixture = createFixture();
	try {
		fixture.stageArtifacts();
		const parsed = parseWindowsSandboxArtifactManifest(fixture.manifestText());
		rmSync(join(fixture.sourceDir, WINDOWS_SANDBOX_ARTIFACT_BINARIES[2]));

		// 旧判定（sandbox-staging-guard.mjs，BUG-0022 的现状）：有任意条目就算 present。
		assert.equal(classifySandboxSource(fixture.sourceDir), "present");
		assert.deepEqual(
			collectMissingSandboxBinaries({ declaredFamilies: ["win32"], sourceDirs: { win32: fixture.sourceDir } }),
			[],
		);

		// 新判定：受控清单逐个核对，缺一个就报出。
		assert.match(
			verifyWindowsSandboxArtifacts({ manifest: parsed.manifest, sourceDir: fixture.sourceDir }).join("\n"),
			/缺少受控制品 codex-command-runner\.exe/,
		);
	} finally {
		fixture.cleanup();
	}
});
