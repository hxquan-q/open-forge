// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	decideArtifactUpdate,
	isExternalArtifactUpdate,
	nextArtifactVersion,
} from "../../../src/features/artifacts/artifact-version-policy.js";

describe("artifact version policy", () => {
	it("baseVersion 对齐且 checksum 一致时接受并单调加一", () => {
		expect(
			decideArtifactUpdate({
				current: { version: 2, checksum: "aaa" },
				baseVersion: 2,
				currentFileChecksum: "aaa",
			}),
		).toEqual({ kind: "accept", nextVersion: 3 });
		expect(nextArtifactVersion(2)).toBe(3);
	});

	it("baseVersion 落后时拒绝，不覆盖当前版本", () => {
		expect(
			decideArtifactUpdate({
				current: { version: 2, checksum: "aaa" },
				baseVersion: 1,
				currentFileChecksum: "aaa",
			}),
		).toEqual({ kind: "stale_version", currentVersion: 2 });
	});

	it("磁盘 checksum 与 descriptor 不一致时拒绝 Agent update，留给外部导入路径", () => {
		expect(
			decideArtifactUpdate({
				current: { version: 2, checksum: "aaa" },
				baseVersion: 2,
				currentFileChecksum: "bbb",
			}),
		).toEqual({ kind: "stale_version", currentVersion: 2 });
	});

	it("外部导入用 modified 状态标记", () => {
		expect(isExternalArtifactUpdate("modified")).toBe(true);
		expect(isExternalArtifactUpdate("generated")).toBe(false);
	});
});
