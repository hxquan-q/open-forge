#!/usr/bin/env node
// Modified by The Open Forge contributors.

/**
 * 发布说明的唯一寻址入口：版本号 → `.github/release-notes/v<version>.md`。
 *
 * 发布流水线拿它做两件事：质量阶段校验文件存在且状态合法（缺了就早早失败，而不是等到
 * 签名、公证、四个平台都跑完才发现没有 Release 正文），发布阶段解析出路径喂给
 * `gh release create --notes-file`。
 *
 * `--check` 同时把「一个版本是否已发布」变成可机械判定的事实：没有 `v<版本>` tag 表示
 * 尚未发布，日期必须停在占位「待定」；已有 tag 表示已发布，文件不得再改。日期只在发布
 * 动作里产生，这样仓库里不会出现「文件写着发布日期、标签却不存在」的自相矛盾。
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RELEASE_NOTES_DIR = ".github/release-notes";

export const RELEASE_NOTES_TITLE_PREFIX = "# Open Forge ";
/** prepare 阶段写入、只有 publish 才会替换掉的占位日期。 */
export const PLACEHOLDER_DATE_LABEL = "发布日期：待定";
/** 上游继承来的说明（`# Vetta …`）原样保留，不当作 fork 正文校验。 */
const UPSTREAM_TITLE_PREFIX = "# Vetta ";
const BASELINE_PATTERN = /^Upstream baseline: upstream\/dev@[0-9a-f]{7,40}$/m;

export function desktopVersion(root = repositoryRoot) {
	const manifest = JSON.parse(readFileSync(join(root, "apps/desktop/package.json"), "utf8"));
	const version = manifest.version;
	if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
		throw new Error(`Invalid desktop version in apps/desktop/package.json: ${String(version)}`);
	}
	return version;
}

export function releaseNotesPath(version) {
	if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid release version: ${version}`);
	return `${RELEASE_NOTES_DIR}/v${version}.md`;
}

export function releaseNotesMissingMessage(version) {
	return [
		`Missing release notes for v${version}: ${releaseNotesPath(version)}`,
		"每个版本都要有发布说明——它就是 GitHub Release 的正文。",
		`新建 ${releaseNotesPath(version)}，写法见 ${RELEASE_NOTES_DIR}/README.md。`,
	].join("\n");
}

/** 存在则返回相对仓库根的路径，缺失时抛出可直接给人看的说明。 */
export function requireReleaseNotes(version, root = repositoryRoot) {
	const path = releaseNotesPath(version);
	if (!existsSync(join(root, path))) throw new Error(releaseNotesMissingMessage(version));
	return path;
}

const normalizeEol = (text) => text.replace(/\r\n/g, "\n");

/**
 * 一份说明文件在当前仓库状态下是否合法。
 *
 * `hasTag` 为 `undefined` 表示取不到 git 信息，此时跳过日期状态这一条，其余照旧校验。
 */
export function releaseNotesStateProblems({ version, notes, hasTag }) {
	const problems = [];
	const lines = notes.split(/\r?\n/);
	const title = (lines[0] ?? "").trim();
	if (title !== `${RELEASE_NOTES_TITLE_PREFIX}${version}`) {
		problems.push(`标题必须是 "${RELEASE_NOTES_TITLE_PREFIX}${version}"，实际是 "${title}"`);
	}
	const dateLine = lines.find((line) => line.startsWith("发布日期："))?.trim();
	if (!dateLine) {
		problems.push("缺少发布日期行");
	} else if (hasTag === false && dateLine !== PLACEHOLDER_DATE_LABEL) {
		problems.push(`还没有 v${version} tag，说明该版本尚未发布，发布日期必须停在「${PLACEHOLDER_DATE_LABEL}」`);
	} else if (hasTag === true && dateLine === PLACEHOLDER_DATE_LABEL) {
		problems.push(`v${version} 已有 tag，发布日期不应还停留在占位`);
	}
	if (!BASELINE_PATTERN.test(notes)) {
		problems.push('缺少 "Upstream baseline: upstream/dev@<sha>" 行');
	}
	return problems;
}

/** 目录里已有的版本说明文件（按版本排序）；用于顺带校验标题与文件名一致。 */
export function releaseNotesVersions(root = repositoryRoot) {
	const dir = join(root, RELEASE_NOTES_DIR);
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.map((name) => /^v(\d+\.\d+\.\d+)\.md$/.exec(name)?.[1])
		.filter((version) => version !== undefined)
		.sort();
}

function gitOutput(args) {
	try {
		return execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" });
	} catch {
		return undefined;
	}
}

/** 收集当前开发版本说明文件的全部问题；取不到 git 信息时只跳过依赖 tag 的两条。 */
export function collectReleaseNotesProblems(version, root = repositoryRoot) {
	const problems = [];
	const path = releaseNotesPath(version);
	const notes = readFileSync(join(root, path), "utf8");
	const tagOutput = gitOutput(["tag", "--list", `v${version}`]);
	const hasTag = tagOutput === undefined ? undefined : tagOutput.trim().length > 0;
	problems.push(...releaseNotesStateProblems({ version, notes, hasTag }));

	if (hasTag === true) {
		const tagged = gitOutput(["show", `v${version}:${path}`]);
		if (tagged !== undefined && normalizeEol(tagged) !== normalizeEol(notes)) {
			problems.push(`v${version} 已发布，说明文件不得再修改（与 tag 处内容不一致）；发现写错请另起一条修订说明`);
		}
	}

	for (const other of releaseNotesVersions(root)) {
		if (other === version) continue;
		const otherNotes = readFileSync(join(root, releaseNotesPath(other)), "utf8");
		const title = (otherNotes.split(/\r?\n/)[0] ?? "").trim();
		if (title.startsWith(UPSTREAM_TITLE_PREFIX)) continue;
		if (title !== `${RELEASE_NOTES_TITLE_PREFIX}${other}`) {
			problems.push(`${releaseNotesPath(other)} 的标题应为 "${RELEASE_NOTES_TITLE_PREFIX}${other}"，实际是 "${title}"`);
		}
	}
	return problems;
}

function main(argv) {
	const versionIndex = argv.indexOf("--version");
	const version = versionIndex === -1 ? desktopVersion() : argv[versionIndex + 1];
	if (!version) throw new Error("--version requires a value");
	const path = requireReleaseNotes(version);
	// --check 只做校验；默认打印路径，方便 shell 里直接代入 --notes-file。
	if (!argv.includes("--check")) {
		console.log(path);
		return;
	}
	const problems = collectReleaseNotesProblems(version);
	if (problems.length > 0) {
		throw new Error([`发布说明状态不合法（v${version}）：`, ...problems.map((problem) => `- ${problem}`)].join("\n"));
	}
	console.log(`Release notes found for v${version}: ${path}`);
}

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
		process.exit(1);
	}
}
