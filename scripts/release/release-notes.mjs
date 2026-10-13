#!/usr/bin/env node
// Modified by The Open Forge contributors.

/**
 * 发布说明的唯一寻址入口：版本号 → `.github/release-notes/v<version>.md`。
 *
 * 发布流水线拿它做两件事：质量阶段校验文件存在且状态合法（缺了就早早失败，而不是等到
 * 签名、公证、四个平台都跑完才发现没有 Release 正文），发布阶段解析出路径喂给
 * `gh release create --notes-file`。
 *
 * `--check` 把「一个版本是否已发布」变成可机械判定的事实：没有 `v<版本>` tag 表示尚未
 * 发布，日期必须停在占位「待定」；已有 tag 表示已发布，文件不得再改。日期只在发布动作里
 * 产生，这样仓库里不会出现「文件写着发布日期、标签却不存在」的自相矛盾。
 *
 * 正文可以由 `.github/release-notes/fragments/v<版本>/` 下的碎片汇编而来：并行任务各自写
 * 一份碎片，`--assemble` 把它们按固定小节顺序拼成唯一正文，正文末尾留标记。既有手写正文
 * （没有标记）与碎片并存时汇编直接报错，不静默丢掉任何一边。
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RELEASE_NOTES_DIR = ".github/release-notes";

export const RELEASE_NOTES_TITLE_PREFIX = "# Open Forge ";
/** prepare 阶段写入、只有 publish 才会替换掉的占位日期。 */
export const PLACEHOLDER_DATE_LABEL = "发布日期：待定";
/** 正文允许的小节，顺序即汇编顺序。 */
export const RELEASE_NOTE_SECTIONS = Object.freeze(["新增", "改进", "修复", "其他"]);
/** 汇编产物末尾的标记；没有它说明正文是手写的。 */
export const ASSEMBLED_MARKER = "<!-- 本文件由 fragments/ 汇编生成：请改碎片，不要直接改这里。 -->";
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

/**
 * 根清单版本必须跟随 Desktop 商用版本线（TASK-0245）：`release:desktop:*` 在
 * prepare/publish 同步改写根清单，这里在 --check 里断言二者一致，漂移即判负。
 * 根清单不存在时（测试夹具）返回 null，不当作问题。
 */
export function rootManifestVersionProblem(root = repositoryRoot) {
	const manifestPath = join(root, "package.json");
	if (!existsSync(manifestPath)) return null;
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	const version = manifest.version;
	if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
		return `根 package.json 版本号非法：${String(version)}；必须是与 Desktop 一致的语义化版本`;
	}
	const desktop = desktopVersion(root);
	if (version !== desktop) {
		return `根 package.json 版本 ${version} 与 Desktop 版本 ${desktop} 不一致；根清单跟随商用版本线，由 release:desktop:* 发版时同步改写`;
	}
	return null;
}

export function releaseNotesPath(version) {
	if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid release version: ${version}`);
	return `${RELEASE_NOTES_DIR}/v${version}.md`;
}

export function fragmentsDir(version) {
	if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid release version: ${version}`);
	return `${RELEASE_NOTES_DIR}/fragments/v${version}`;
}

export function releaseNotesMissingMessage(version) {
	return [
		`Missing release notes for v${version}: ${releaseNotesPath(version)}`,
		"每个版本都要有发布说明——它就是 GitHub Release 的正文。",
		`先运行 release:desktop:prepare 生成骨架，写法见 ${RELEASE_NOTES_DIR}/README.md。`,
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

/** 某版本已有的碎片路径，按文件名排序，保证汇编顺序稳定。 */
export function listFragmentPaths(version, root = repositoryRoot) {
	const dir = join(root, fragmentsDir(version));
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((name) => name.endsWith(".md"))
		.sort()
		.map((name) => `${fragmentsDir(version)}/${name}`);
}

/** 把一份碎片解析成 [{ section, entries }]，按出现顺序；空行与段落外内容忽略。 */
export function parseFragmentSections(content) {
	const blocks = [];
	let current;
	for (const raw of content.split(/\r?\n/)) {
		const line = raw.trimEnd();
		const heading = /^##\s+(.+?)\s*$/.exec(line);
		if (heading) {
			current = { section: heading[1], entries: [] };
			blocks.push(current);
			continue;
		}
		if (!current) continue;
		if (line.trim().length === 0) continue;
		current.entries.push(line.trim());
	}
	return blocks;
}

/** 碎片本身的格式问题：小节必须在允许集合内，且每节至少一条。 */
export function fragmentProblems({ path, content }) {
	const problems = [];
	const blocks = parseFragmentSections(content);
	if (blocks.length === 0) {
		problems.push(`${path} 没有任何 "## <小节>" 段落`);
		return problems;
	}
	for (const block of blocks) {
		if (!RELEASE_NOTE_SECTIONS.includes(block.section)) {
			problems.push(`${path} 的小节 "${block.section}" 不在 ${RELEASE_NOTE_SECTIONS.join("、")} 之内`);
		}
		if (block.entries.length === 0) {
			problems.push(`${path} 的小节 "${block.section}" 没有任何条目`);
		}
	}
	return problems;
}

function dateLineOf(notes) {
	return notes.split(/\r?\n/).find((line) => line.startsWith("发布日期："))?.trim();
}

function baselineLineOf(notes) {
	return notes.split(/\r?\n/).find((line) => line.startsWith("Upstream baseline:"))?.trim();
}

/**
 * 把碎片汇编成正文。
 *
 * 日期与上游基线行取自现有正文（由 prepare 与 publish 维护），汇编只负责小节内容；
 * 现有正文没有标记却有碎片时抛错，避免手写条目被静默覆盖。
 */
export function assembleReleaseNotes({ version, notes, fragments }) {
	const baseline = baselineLineOf(notes);
	if (!baseline) throw new Error(`现有正文缺少上游基线行，无法汇编：${releaseNotesPath(version)}`);
	if (fragments.length > 0 && !notes.includes(ASSEMBLED_MARKER)) {
		throw new Error(
			`${releaseNotesPath(version)} 是手写正文，同时又有 ${fragments.length} 份碎片；` +
				"请先把既有条目迁进碎片并删除标记缺失状态，或清空碎片后再汇编。",
		);
	}
	const bySection = new Map(RELEASE_NOTE_SECTIONS.map((section) => [section, []]));
	for (const fragment of fragments) {
		for (const block of parseFragmentSections(fragment.content)) {
			if (!bySection.has(block.section)) continue;
			for (const entry of block.entries) {
				bySection.get(block.section).push(entry.startsWith("- ") ? entry : `- ${entry}`);
			}
		}
	}
	const lines = [
		`${RELEASE_NOTES_TITLE_PREFIX}${version}`,
		"",
		dateLineOf(notes) ?? PLACEHOLDER_DATE_LABEL,
		"",
		baseline,
	];
	for (const section of RELEASE_NOTE_SECTIONS) {
		const entries = bySection.get(section);
		if (entries.length === 0) continue;
		lines.push("", `## ${section}`, "");
		lines.push(...entries);
	}
	lines.push("", ASSEMBLED_MARKER);
	return `${lines.join("\n")}\n`;
}

function gitOutput(args) {
	try {
		return execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" });
	} catch {
		return undefined;
	}
}

/** 读入现有正文与碎片；正文缺失时给出可直接照做的提示。 */
function readAssembleInputs(version, root = repositoryRoot) {
	const path = releaseNotesPath(version);
	if (!existsSync(join(root, path))) throw new Error(releaseNotesMissingMessage(version));
	const notes = readFileSync(join(root, path), "utf8");
	const fragments = listFragmentPaths(version, root).map((fragmentPath) => ({
		path: fragmentPath,
		content: readFileSync(join(root, fragmentPath), "utf8"),
	}));
	return { path, notes, fragments };
}

/**
 * 汇编并把结果写回正文；返回 { path, changed }。
 *
 * 没有碎片时是纯 no-op：手写正文的版本（迁移前）不受影响，这一点是加法式生效的前提。
 */
export function assembleReleaseNotesFile(version, root = repositoryRoot) {
	const { path, notes, fragments } = readAssembleInputs(version, root);
	if (fragments.length === 0) return { path, changed: false };
	const assembled = assembleReleaseNotes({ version, notes, fragments });
	if (normalizeEol(assembled) === normalizeEol(notes)) return { path, changed: false };
	writeFileSync(join(root, path), assembled);
	return { path, changed: true };
}

/** 收集当前开发版本说明文件的全部问题；取不到 git 信息时只跳过依赖 tag 的两条。 */
export function collectReleaseNotesProblems(version, root = repositoryRoot) {
	const problems = [];
	const path = releaseNotesPath(version);
	const notes = readFileSync(join(root, path), "utf8");
	const tagOutput = gitOutput(["tag", "--list", `v${version}`]);
	const hasTag = tagOutput === undefined ? undefined : tagOutput.trim().length > 0;
	problems.push(...releaseNotesStateProblems({ version, notes, hasTag }));

	const manifestVersionProblem = rootManifestVersionProblem(root);
	if (manifestVersionProblem) problems.push(manifestVersionProblem);

	if (hasTag === true) {
		const tagged = gitOutput(["show", `v${version}:${path}`]);
		if (tagged !== undefined && normalizeEol(tagged) !== normalizeEol(notes)) {
			problems.push(`v${version} 已发布，说明文件不得再修改（与 tag 处内容不一致）；发现写错请另起一条修订说明`);
		}
	}

	const fragments = listFragmentPaths(version, root).map((fragmentPath) => ({
		path: fragmentPath,
		content: readFileSync(join(root, fragmentPath), "utf8"),
	}));
	for (const fragment of fragments) {
		problems.push(...fragmentProblems(fragment));
	}
	if (fragments.length > 0) {
		try {
			const assembled = assembleReleaseNotes({ version, notes, fragments });
			if (normalizeEol(assembled) !== normalizeEol(notes)) {
				problems.push(
					`${path} 与 ${fragmentsDir(version)} 下的碎片不一致；运行 node scripts/release/release-notes.mjs --assemble 重新汇编`,
				);
			}
		} catch (error) {
			problems.push(error instanceof Error ? error.message : String(error));
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

	if (argv.includes("--assemble")) {
		const { changed } = assembleReleaseNotesFile(version);
		console.log(changed ? `Assembled ${path} from ${fragmentsDir(version)}.` : `No fragments for v${version}; ${path} left unchanged.`);
		return;
	}
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
