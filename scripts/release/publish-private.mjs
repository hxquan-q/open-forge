#!/usr/bin/env node
// Copyright The Open Forge contributors.
/**
 * `publish:private` 的入口守卫，与 `scripts/release.mjs` 共用同一 fail-closed 策略。
 *
 * ISSUE-0009 决策：workspace 包当前不公开发布。无显式 `RELEASE_PACKAGE_SCOPE=lockstep`
 * 与 `RELEASE_PUSH=true` 授权、或 workspace 版本不一致时，在任何 `npm publish` 之前拒绝。
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validatePackageReleaseScope } from "./package-release-policy.mjs";

export function publishableManifestPaths() {
	return [
		"package.json",
		...readdirSync("packages", { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => join("packages", entry.name, "package.json"))
			.filter((path) => existsSync(path)),
	];
}

export function readPublishableEntries(paths = publishableManifestPaths()) {
	return paths.map((path) => ({
		path,
		version: JSON.parse(readFileSync(path, "utf-8")).version,
	}));
}

try {
	validatePackageReleaseScope({
		scope: process.env.RELEASE_PACKAGE_SCOPE,
		pushAuthorized: process.env.RELEASE_PUSH === "true",
		packages: readPublishableEntries(),
	});
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}

execFileSync("npm", ["publish", "-ws"], { stdio: "inherit" });
