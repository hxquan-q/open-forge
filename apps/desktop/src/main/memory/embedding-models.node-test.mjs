// Copyright The Open Forge contributors.
/**
 * TASK-0381 桌面 embedding 模型目录合同测试（node --test 直跑；无网络、
 * 无磁盘探测——状态解析是纯函数，资源视图由用例构造）。真实下载/推理/
 * 跨平台行为不在本文件内验证，如实留给授权后的独立验收。
 */
import assert from "node:assert/strict";
import test from "node:test";

const { describeEmbeddingModel, EMBEDDING_MODEL_CATALOG, resolveEmbeddingModelStatus } = await import(
	new URL("./embedding-models.ts", import.meta.url).href
);

test("目录唯一候选固定为 e5-small：维度/前缀/许可证齐备且 checksum 如实未钉住", () => {
	assert.equal(EMBEDDING_MODEL_CATALOG.length, 1);
	const entry = EMBEDDING_MODEL_CATALOG[0];
	assert.equal(entry.id, "intfloat/multilingual-e5-small");
	assert.equal(entry.dimension, 384);
	assert.equal(entry.normalization, "l2");
	assert.equal(entry.queryPrefix, "query: ");
	assert.equal(entry.passagePrefix, "passage: ");
	assert.notEqual(entry.queryPrefix, entry.passagePrefix);
	assert.match(entry.modelLicense, /MIT/);
	// 未钉住的候选不能伪装成可发布产物：目录如实携带 null。
	assert.equal(entry.artifact.sha256, null);
	assert.equal(entry.artifact.bytes, null);
	assert.equal(entry.runtime.version, null);
	assert.equal(entry.portLicenseNote, null);
});

test("状态解析六分支：缺失/未钉住不可用，损坏/缺运行库降级，仅钉住+命中+运行库齐备才 ready", () => {
	const entry = EMBEDDING_MODEL_CATALOG[0];
	const pinnedEntry = {
		...entry,
		artifact: { ...entry.artifact, sha256: "a".repeat(64), bytes: 1024 },
	};
	const view = (overrides) => ({
		directoryExists: true,
		artifactExists: true,
		checksumMatches: true,
		runtimeModuleAvailable: true,
		...overrides,
	});
	assert.deepEqual(resolveEmbeddingModelStatus(entry, view({ directoryExists: false })), {
		status: "unavailable",
		reason: "directory-missing",
	});
	assert.deepEqual(resolveEmbeddingModelStatus(entry, view({ artifactExists: false })), {
		status: "unavailable",
		reason: "artifact-missing",
	});
	assert.deepEqual(resolveEmbeddingModelStatus(entry, view({})), {
		status: "unavailable",
		reason: "checksum-not-pinned",
	});
	assert.deepEqual(resolveEmbeddingModelStatus(pinnedEntry, view({ checksumMatches: false })), {
		status: "degraded",
		reason: "checksum-mismatch",
	});
	assert.deepEqual(resolveEmbeddingModelStatus(pinnedEntry, view({ runtimeModuleAvailable: false })), {
		status: "degraded",
		reason: "runtime-missing",
	});
	assert.deepEqual(resolveEmbeddingModelStatus(pinnedEntry, view({})), { status: "ready" });
});

test("描述输出是纯事实：前缀要求/钉住状态/许可证可见，无路径或密钥字段", () => {
	const entry = EMBEDDING_MODEL_CATALOG[0];
	const described = describeEmbeddingModel(entry);
	assert.equal(described.requiresPrefixes, true);
	assert.equal(described.pinnedChecksum, false);
	assert.equal(described.pinnedRuntimeVersion, false);
	assert.match(described.license, /MIT/);
	assert.ok(!JSON.stringify(described).includes(":\\") && !JSON.stringify(described).includes("token"));
});
