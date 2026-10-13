// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { isUpstreamLine, versionLineProblems } from "./check-version-lines.mjs";

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
		).toEqual([
			"apps/docs-site/package.json: 版本 0.55.3 属上游 0.5.x 锁步线；请归入自有版本线（内部包 0.0.x，产品面跟随 apps/desktop）",
		]);
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
