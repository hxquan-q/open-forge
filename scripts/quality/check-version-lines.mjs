#!/usr/bin/env node
// Copyright The Open Forge contributors.
/**
 * 版本线门禁（TASK-0246/0247）：git 追踪的全部 package.json 满足两条不变量——
 * 1) 禁止上游 0.5.x/0.55.x 锁步线版本（上游 Open Vetta 发版线特征）；
 * 2) 产品面 manifest（统一线，豁免插件/主题/示例/mobile/vendor）必须与
 *    apps/desktop/package.json#version 同版本，由 release:desktop:* 发版同步改写。
 * 根↔Desktop 一致性另由 release-notes --check 断言（TASK-0245），互为冗余兜底。
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

/**
 * 统一线成员判定（TASK-0247）：产品面 manifest 必须与 apps/desktop 同版本。
 * 豁免独立线：插件（packages/plugins/**）、内置主题（packages/themes/**）、
 * 扩展示例（packages/coding-agent/examples/**）、移动端（apps/mobile/**）、
 * vendor shim（apps/desktop/vendor/**）。发版脚本复用同一判定。
 */
export function isUnifiedVersionManifestPath(path) {
	if (!/(^|\/)package\.json$/.test(path)) return false;
	return !(
		path.startsWith("packages/plugins/") ||
		path.startsWith("packages/themes/") ||
		path.startsWith("packages/coding-agent/examples/") ||
		path.startsWith("apps/mobile/") ||
		path.startsWith("apps/desktop/vendor/")
	);
}

/** manifests: [{ path, version }]；返回问题文案数组，空即通过。 */
export function versionLineProblems(manifests) {
	const problems = [];
	for (const manifest of manifests) {
		if (typeof manifest.version !== "string" || manifest.version.length === 0) continue;
		if (isUpstreamLine(manifest.version)) {
			problems.push(`${manifest.path}: 版本 ${manifest.version} 属上游 0.5.x 锁步线；请归入自有版本线`);
		}
	}
	return problems;
}

/** 统一线：产品面 manifest 版本必须等于 Desktop 版本（release:desktop:* 发版时同步改写）。 */
export function unifiedLineProblems(manifests, desktopVersion) {
	const problems = [];
	for (const manifest of manifests) {
		if (!isUnifiedVersionManifestPath(manifest.path)) continue;
		if (typeof manifest.version !== "string" || manifest.version.length === 0) {
			problems.push(`${manifest.path}: 统一线 manifest 缺少 version 字段`);
			continue;
		}
		if (manifest.version !== desktopVersion) {
			problems.push(
				`${manifest.path}: 版本 ${manifest.version} 未与产品线统一（应为 ${desktopVersion}）；产品面 manifest 跟随 apps/desktop 版本，由 release:desktop:* 发版时同步改写`,
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
	const desktop = manifests.find((manifest) => manifest.path === "apps/desktop/package.json");
	const problems = versionLineProblems(manifests);
	if (desktop?.version) problems.push(...unifiedLineProblems(manifests, desktop.version));
	if (problems.length > 0) {
		fail(`版本线检查未通过（${problems.length} 处）:\n  ${problems.join("\n  ")}`);
		return;
	}
	const unifiedCount = manifests.filter((manifest) => isUnifiedVersionManifestPath(manifest.path)).length;
	ok(
		`[version-lines] ${manifests.length} manifest(s)：无上游线残留，${unifiedCount} 个统一线 manifest 与 Desktop 同版本`,
	);
}

if (isDirectRun(import.meta.url)) {
	main();
}
