#!/usr/bin/env node
// Copyright The Open Forge contributors.
/**
 * 版本线门禁（TASK-0246）：git 追踪的全部 package.json 禁止上游 0.5.x 锁步线版本。
 *
 * Open Forge 的版本语义（TASK-0245/0246 收口）：
 * - 产品版本单一事实源是 apps/desktop/package.json，根清单跟随同线；
 * - 内部 workspace 包统一 0.0.x（private，不发布）；插件/主题/examples 各自独立线。
 * 上游 Open Vetta 锁步发版线是 0.5.x——任何 manifest 停在该区间即为残留，
 * 商用口径下不允许与自有版本线并存。根↔Desktop 一致性由 release-notes --check
 * 断言，本门禁不重复。
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fail, isDirectRun, ok, repoRoot } from "./lib.mjs";

/** 上游锁步线特征：主版本 0、次版本 5 或 55（0.5.x 与 0.55.x 两段，含 prerelease 后缀）。 */
export function isUpstreamLine(version) {
	const match = /^(\d+)\.(\d+)\.(\d+)(?:-[^\s]+)?$/.exec(String(version));
	return match !== null && match[1] === "0" && (match[2] === "5" || match[2] === "55");
}

/** manifests: [{ path, version }]；返回问题文案数组，空即通过。 */
export function versionLineProblems(manifests) {
	const problems = [];
	for (const manifest of manifests) {
		if (typeof manifest.version !== "string" || manifest.version.length === 0) continue;
		if (isUpstreamLine(manifest.version)) {
			problems.push(
				`${manifest.path}: 版本 ${manifest.version} 属上游 0.5.x 锁步线；请归入自有版本线（内部包 0.0.x，产品面跟随 apps/desktop）`,
			);
		}
	}
	return problems;
}

export function trackedManifests(root = repoRoot) {
	const output = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });
	const manifests = [];
	for (const relative of output.split("\n")) {
		const path = relative.trim();
		// 任意深度的 package.json（vendor shim 有 7 层），node_modules 内不会有追踪文件。
		if (!path || !/(^|\/)package\.json$/.test(path) || path.includes("node_modules")) continue;
		let version;
		try {
			version = JSON.parse(readFileSync(join(root, path), "utf8")).version;
		} catch {
			continue;
		}
		manifests.push({ path, version });
	}
	return manifests;
}

function main() {
	const manifests = trackedManifests();
	const problems = versionLineProblems(manifests);
	if (problems.length > 0) {
		fail(`发现上游 0.5.x 版本线残留（${problems.length} 处）:\n  ${problems.join("\n  ")}`);
		return;
	}
	ok(`[version-lines] ${manifests.length} manifest(s) 均不在上游 0.5.x 锁步线`);
}

if (isDirectRun(import.meta.url)) {
	main();
}
