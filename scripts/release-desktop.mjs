#!/usr/bin/env node
// Modified by The Open Forge contributors.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { releaseNotesPath } from "./release/release-notes.mjs";

const DESKTOP_PACKAGE_PATH = "apps/desktop/package.json";
/** 根清单版本跟随 Desktop 商用版本线，prepare/publish 与 Desktop 同步改写（TASK-0245）。 */
const ROOT_PACKAGE_PATH = "package.json";
const LOCKFILE_PATH = "bun.lock";
const BUMP_TYPES = new Set(["major", "minor", "patch"]);
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

function run(command, args, options = {}) {
	console.log(`$ ${command} ${args.join(" ")}`);
	return execFileSync(command, args, {
		encoding: "utf8",
		stdio: options.capture ? "pipe" : "inherit",
		...options,
	});
}

function readDesktopPackage() {
	return JSON.parse(readFileSync(DESKTOP_PACKAGE_PATH, "utf8"));
}

export function bumpVersion(version, bumpType) {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	if (!match) throw new Error(`Invalid desktop version: ${version}`);

	const major = Number(match[1]);
	const minor = Number(match[2]);
	const patch = Number(match[3]);
	if (bumpType === "major") return `${major + 1}.0.0`;
	if (bumpType === "minor") return `${major}.${minor + 1}.0`;
	if (bumpType === "patch") return `${major}.${minor}.${patch + 1}`;
	throw new Error(`Invalid desktop version bump: ${bumpType}`);
}

export function parseDesktopReleaseCommand(args) {
	const [command, ...rest] = args;
	if (command === "prepare") {
		if (rest.length === 1 && BUMP_TYPES.has(rest[0])) {
			return { command, kind: "bump", value: rest[0] };
		}
		if (
			rest.length === 3 &&
			rest[0] === "--version" &&
			SEMVER_PATTERN.test(rest[1]) &&
			rest[2] === "--initial"
		) {
			return { command, kind: "set", version: rest[1], initial: true };
		}
		throw new Error(
			"Usage: node scripts/release-desktop.mjs prepare <major|minor|patch> | prepare --version <X.Y.Z> --initial",
		);
	}
	if (command === "publish") {
		if (rest.length !== 2 || !SEMVER_PATTERN.test(rest[0])) {
			throw new Error("Usage: node scripts/release-desktop.mjs publish <X.Y.Z> --confirm-publish");
		}
		if (rest[1] !== "--confirm-publish") {
			throw new Error("Publishing requires the explicit --confirm-publish flag");
		}
		return { command, version: rest[0] };
	}
	throw new Error(
		"Usage: node scripts/release-desktop.mjs prepare <major|minor|patch> | publish <X.Y.Z> --confirm-publish",
	);
}

export function releaseNotesTemplate(version, upstreamBaseline = "<merge-base sha>") {
	if (!SEMVER_PATTERN.test(version)) throw new Error(`Invalid release version: ${version}`);
	return `# Open Forge ${version}\n\n发布日期：待定\n\nUpstream baseline: upstream/dev@${upstreamBaseline}\n\n<!-- 本文件由 fragments/ 汇编生成：请改碎片，不要直接改这里。 -->\n`;
}

export function upstreamBaselineSha() {
	return run("git", ["merge-base", "upstream/dev", "HEAD"], { capture: true }).trim();
}

/**
 * 解析 `git status --porcelain` 的输出为路径列表。
 *
 * 每行是固定宽度的 `XY <path>`（两位状态码 + 一个空格），未暂存修改的行以空格开头。
 * 因此绝不能对整段输出做 trim：那会削掉第一行的前导空格，使其后的 slice(3) 吃掉
 * 路径首字母，第一个文件永远匹配不上白名单。
 *
 * @param {string} stdout
 * @returns {string[]}
 */
export function parsePorcelainPaths(stdout) {
	return stdout
		.split(/\r?\n/)
		.filter((line) => line.length > 3)
		.map((line) => line.slice(3).replaceAll("\\", "/"));
}

export function getUnexpectedReleaseChanges(stdout, notesPath) {
	const allowedFiles = new Set([DESKTOP_PACKAGE_PATH, ROOT_PACKAGE_PATH, LOCKFILE_PATH, notesPath]);
	return parsePorcelainPaths(stdout).filter((file) => !allowedFiles.has(file));
}

function assertCleanWorktree() {
	const status = run("git", ["status", "--porcelain"], { capture: true }).trim();
	if (status) throw new Error(`Uncommitted changes detected:\n${status}`);
}

function assertOnlyReleaseFilesChanged(notesPath, requiredFiles) {
	const status = run("git", ["status", "--porcelain"], { capture: true });
	const changedFiles = parsePorcelainPaths(status);
	const unexpectedFiles = getUnexpectedReleaseChanges(status, notesPath);
	if (unexpectedFiles.length > 0) {
		throw new Error(`Desktop release changed unexpected files:\n${unexpectedFiles.join("\n")}`);
	}
	for (const file of requiredFiles) {
		if (!changedFiles.includes(file)) throw new Error(`Desktop release is missing an expected change: ${file}`);
	}
}

function assertBranch() {
	const branch = run("git", ["branch", "--show-current"], { capture: true }).trim();
	if (!branch) throw new Error("Desktop release must run on a branch, not a detached HEAD");
	return branch;
}

function assertLocalTagAvailable(tag) {
	if (run("git", ["tag", "--list", tag], { capture: true }).trim()) {
		throw new Error(`Tag already exists locally: ${tag}`);
	}
}

function assertRemoteTagAvailable(tag) {
	const refs = run("git", ["ls-remote", "--tags", "origin", `refs/tags/${tag}`], { capture: true }).trim();
	if (refs) throw new Error(`Tag already exists on origin: ${tag}`);
}

function assertTagAvailable(tag) {
	assertLocalTagAvailable(tag);
	assertRemoteTagAvailable(tag);
}

function runReleaseChecks() {
	run("bun", ["run", "check:lint"]);
	run("bun", ["run", "--cwd", "apps/desktop", "typecheck"]);
	run("bun", ["run", "check:guards"]);
}

function resolvePreparedVersion(currentVersion, command) {
	return command.kind === "bump" ? bumpVersion(currentVersion, command.value) : command.version;
}

function prepareRelease(command) {
	assertCleanWorktree();
	assertBranch();
	runReleaseChecks();
	assertCleanWorktree();

	const desktopPackage = readDesktopPackage();
	const currentVersion = desktopPackage.version;
	const version = resolvePreparedVersion(currentVersion, command);
	if (version === currentVersion) throw new Error(`Desktop release version is already ${version}`);
	const notesPath = releaseNotesPath(version);
	const notesAlreadyExist = existsSync(notesPath);
	assertLocalTagAvailable(`v${version}`);

	if (!notesAlreadyExist) writeFileSync(notesPath, releaseNotesTemplate(version, upstreamBaselineSha()));
	desktopPackage.version = version;
	writeFileSync(DESKTOP_PACKAGE_PATH, `${JSON.stringify(desktopPackage, null, "\t")}\n`);
	const rootPackage = JSON.parse(readFileSync(ROOT_PACKAGE_PATH, "utf8"));
	rootPackage.version = version;
	writeFileSync(ROOT_PACKAGE_PATH, `${JSON.stringify(rootPackage, null, "\t")}\n`);
	run("bun", ["install", "--lockfile-only"]);
	assertOnlyReleaseFilesChanged(notesPath, [DESKTOP_PACKAGE_PATH, ROOT_PACKAGE_PATH, LOCKFILE_PATH]);
	console.log(`Desktop ${version} is prepared locally. Review ${notesPath} before publishing.`);
}

/** 占位日期：prepare 写它，publish 把它替换成当天日期。与 release-notes.mjs 共用同一常量。 */
export const PLACEHOLDER_DATE_LABEL = "发布日期：待定";

function localToday(now = new Date()) {
	const pad = (value) => String(value).padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 把占位日期换成真实发布日期；已经是真实日期时拒绝，避免重复发布时静默改写。 */
export function stampReleaseDate(notes, date = localToday()) {
	if (!notes.includes(PLACEHOLDER_DATE_LABEL)) {
		throw new Error("发布说明的发布日期不是占位，不能自动改写：" + PLACEHOLDER_DATE_LABEL);
	}
	return notes.replace(PLACEHOLDER_DATE_LABEL, "发布日期：" + date);
}
function assertReleaseNotesReady(version) {
	const notesPath = releaseNotesPath(version);
	if (!existsSync(notesPath)) throw new Error(`Missing release notes: ${notesPath}`);
	const notes = readFileSync(notesPath, "utf8");
	const [title, , date] = notes.split(/\r?\n/);
	if (title !== `# Open Forge ${version}`) throw new Error(`Release notes must start with "# Open Forge ${version}"`);
	if (!date || !date.includes(PLACEHOLDER_DATE_LABEL)) {
		throw new Error("发布日期只在发布动作里产生，发布前必须停在占位：" + PLACEHOLDER_DATE_LABEL);
	}
	if (!/^## (新增|改进|修复|其他)$/m.test(notes) || !/^\s*- .+/m.test(notes)) {
		throw new Error("Release notes need at least one populated section");
	}
	if (!/^Upstream baseline: upstream\/dev@[0-9a-f]{7,40}$/m.test(notes)) {
		throw new Error(`Release notes must record the upstream baseline as "Upstream baseline: upstream/dev@<sha>"`);
	}
	return notesPath;
}

export function desktopPublishCommands(version, branch) {
	return [
		["add", "--", DESKTOP_PACKAGE_PATH, ROOT_PACKAGE_PATH, LOCKFILE_PATH, releaseNotesPath(version)],
		["commit", "-m", `release(desktop): 发布 v${version}`],
		["tag", `v${version}`],
		["push", "--atomic", "origin", branch, `refs/tags/v${version}`],
	];
}

function publishRelease(version) {
	assertBranch();
	const desktopPackage = readDesktopPackage();
	if (desktopPackage.version !== version) {
		throw new Error(`Desktop package version ${desktopPackage.version} does not match requested release ${version}`);
	}
	const rootPackage = JSON.parse(readFileSync(ROOT_PACKAGE_PATH, "utf8"));
	if (rootPackage.version !== version) {
		throw new Error(`Root package version ${rootPackage.version} does not match requested release ${version}`);
	}

	const notesPath = assertReleaseNotesReady(version);
	assertOnlyReleaseFilesChanged(notesPath, [DESKTOP_PACKAGE_PATH, ROOT_PACKAGE_PATH, LOCKFILE_PATH]);
	assertTagAvailable(`v${version}`);
	runReleaseChecks();
	assertOnlyReleaseFilesChanged(notesPath, [DESKTOP_PACKAGE_PATH, ROOT_PACKAGE_PATH, LOCKFILE_PATH]);

	// 发布日期只有走到发布这一步才产生，随后才提交、打 tag。
	writeFileSync(notesPath, stampReleaseDate(readFileSync(notesPath, "utf8")));

	// Release notes are the GitHub Release body and must be present before the tag triggers CI.
	const branch = assertBranch();
	for (const args of desktopPublishCommands(version, branch)) run("git", args);
	console.log(`Desktop v${version} was pushed; waiting for the desktop-release workflow.`);
}

function main(argv) {
	const command = parseDesktopReleaseCommand(argv);
	if (command.command === "prepare") prepareRelease(command);
	else publishRelease(command.version);
}

// Top-level direct execution can make an import trigger a real release; keep the side-effect behind this guard.
function isExecutedDirectly() {
	const invoked = process.argv[1];
	if (!invoked) return false;
	return fileURLToPath(import.meta.url).toLowerCase() === resolve(invoked).toLowerCase();
}

if (isExecutedDirectly()) {
	try {
		main(process.argv.slice(2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
