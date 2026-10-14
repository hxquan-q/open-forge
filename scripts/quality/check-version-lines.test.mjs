// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import {
	isUnifiedVersionManifestPath,
	isUpstreamLine,
	unifiedLineProblems,
	versionLineProblems,
} from "./check-version-lines.mjs";

describe("isUpstreamLine", () => {
	it("flags every version on the upstream lockstep line", () => {
		expect(isUpstreamLine("0.5.41")).toBe(true);
		expect(isUpstreamLine("0.55.3")).toBe(true);
		expect(isUpstreamLine("0.5.59-beta.1")).toBe(true);
	});

	it("accepts the fork's own version lines", () => {
		expect(isUpstreamLine("0.0.1")).toBe(false);
		expect(isUpstreamLine("0.1.3")).toBe(false);
		expect(isUpstreamLine("0.4.0")).toBe(false);
		expect(isUpstreamLine("0.56.0")).toBe(false);
		expect(isUpstreamLine("0.6.0")).toBe(false);
		expect(isUpstreamLine("1.0.0")).toBe(false);
		expect(isUpstreamLine("0.0.0-vetta-shim")).toBe(false);
	});
});

describe("versionLineProblems", () => {
	it("reports each manifest left on the upstream line with its path", () => {
		expect(
			versionLineProblems([
				{ path: "apps/docs-site/package.json", version: "0.55.3" },
				{ path: "packages/ai/package.json", version: "0.0.1" },
			]),
		).toEqual(["apps/docs-site/package.json: 版本 0.55.3 属上游 0.5.x 锁步线；请归入自有版本线"]);
	});

	it("passes when every manifest sits on a fork-owned line", () => {
		expect(
			versionLineProblems([
				{ path: "package.json", version: "0.1.3" },
				{ path: "apps/desktop/package.json", version: "0.1.3" },
				{ path: "packages/runtime-knowledge/package.json", version: "0.0.1" },
				{ path: "apps/mobile/package.json", version: "1.0.0" },
			]),
		).toEqual([]);
	});

	it("skips manifests without a version field instead of guessing", () => {
		expect(versionLineProblems([{ path: "fixtures/no-version/package.json" }])).toEqual([]);
	});
});

describe("isUnifiedVersionManifestPath", () => {
	it("claims the product-surface manifests, including the root and Desktop", () => {
		expect(isUnifiedVersionManifestPath("package.json")).toBe(true);
		expect(isUnifiedVersionManifestPath("apps/desktop/package.json")).toBe(true);
		expect(isUnifiedVersionManifestPath("apps/cli-host/package.json")).toBe(true);
		expect(isUnifiedVersionManifestPath("packages/runtime-core/package.json")).toBe(true);
	});

	it("exempts the independent version lines", () => {
		expect(isUnifiedVersionManifestPath("packages/plugins/plugin-sdk/package.json")).toBe(false);
		expect(isUnifiedVersionManifestPath("packages/themes/default/package.json")).toBe(false);
		expect(isUnifiedVersionManifestPath("packages/coding-agent/examples/demo/package.json")).toBe(false);
		expect(isUnifiedVersionManifestPath("apps/mobile/package.json")).toBe(false);
		expect(isUnifiedVersionManifestPath("apps/desktop/vendor/runtime/package.json")).toBe(false);
	});

	it("ignores files that are not manifests", () => {
		expect(isUnifiedVersionManifestPath("scripts/quality/package-lock.json")).toBe(false);
		expect(isUnifiedVersionManifestPath("packages/ai/README.md")).toBe(false);
	});
});

describe("unifiedLineProblems", () => {
	it("flags every product-surface manifest that drifted from the Desktop version", () => {
		expect(
			unifiedLineProblems(
				[
					{ path: "apps/desktop/package.json", version: "0.1.3" },
					{ path: "packages/ai/package.json", version: "0.0.1" },
					{ path: "apps/mobile/package.json", version: "1.0.0" },
				],
				"0.1.3",
			),
		).toEqual([
			"packages/ai/package.json: 版本 0.0.1 未与产品线统一（应为 0.1.3）；产品面 manifest 跟随 apps/desktop 版本，由 release:desktop:* 发版时同步改写",
		]);
	});

	it("passes when the whole unified line shares the Desktop version", () => {
		expect(
			unifiedLineProblems(
				[
					{ path: "package.json", version: "0.1.3" },
					{ path: "apps/desktop/package.json", version: "0.1.3" },
					{ path: "packages/ui/package.json", version: "0.1.3" },
					{ path: "packages/plugins/plugin-sdk/package.json", version: "0.3.0" },
				],
				"0.1.3",
			),
		).toEqual([]);
	});

	it("reports a unified manifest that lost its version field", () => {
		expect(unifiedLineProblems([{ path: "packages/ui/package.json" }], "0.1.3")).toEqual([
			"packages/ui/package.json: 统一线 manifest 缺少 version 字段",
		]);
	});
});
