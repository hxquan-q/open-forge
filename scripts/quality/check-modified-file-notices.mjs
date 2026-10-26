#!/usr/bin/env node
// Modified by The Open Forge contributors.
/**
 * Apache-2.0 §4(b) 修改声明审计（ISSUE-0008）。
 *
 * 以动态 `git merge-base upstream/dev HEAD` 为基线，枚举 fork 相对上游的修改
 * （含工作区未提交改动与未跟踪文件）。每个可注释的修改文件必须带
 * `Modified by The Open Forge contributors`；fork 自有新文件带
 * `Copyright The Open Forge contributors`。格式不支持注释的文件（JSON、
 * 锁文件、二进制等）与归档/上游发布原文列入白名单，由 NOTICE 兜底声明。
 *
 * 用法：
 *   node scripts/quality/check-modified-file-notices.mjs          # 审计，漏标即非零退出
 *   node scripts/quality/check-modified-file-notices.mjs --write  # 为缺失文件插入声明头
 *   node scripts/quality/check-modified-file-notices.mjs --baseline <file>        # ratchet：仅基线之外的新缺失判负
 *   node scripts/quality/check-modified-file-notices.mjs --write-baseline <file>  # 把当前缺失快照写成基线
 *
 * 需要本地存在 upstream remote（`git fetch upstream`）。--baseline 模式下若
 * upstream remote 不可用，回落使用基线文件记录的 merge-base sha；该 commit
 * 对象也不存在（如无历史浅克隆）时打印告警并放行，避免误伤无 upstream 的
 * 外部贡献者环境。
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const MODIFIED_NOTICE = "Modified by The Open Forge contributors.";
const ADDED_NOTICE = "Copyright The Open Forge contributors.";
const NOTICE_MARKER = "The Open Forge contributors";

const LINE_STYLES = {
	slash: { render: (text) => `// ${text}` },
	hash: { render: (text) => `# ${text}` },
	block: { render: (text) => `/* ${text} */` },
	html: { render: (text) => `<!-- ${text} -->` },
	jsx: { render: (text) => `{/* ${text} */}` },
	sql: { render: (text) => `-- ${text}` },
	semicolon: { render: (text) => `; ${text}` },
};

const STYLE_BY_EXTENSION = {
	"code-workspace": "slash",
	ts: "slash",
	tsx: "slash",
	mts: "slash",
	cts: "slash",
	js: "slash",
	jsx: "slash",
	mjs: "slash",
	cjs: "slash",
	go: "slash",
	mod: "slash",
	rs: "slash",
	java: "slash",
	kt: "slash",
	kts: "slash",
	swift: "slash",
	c: "slash",
	cc: "slash",
	cpp: "slash",
	h: "slash",
	hpp: "slash",
	cs: "slash",
	sh: "hash",
	bash: "hash",
	ps1: "hash",
	psm1: "hash",
	psd1: "hash",
	py: "hash",
	rb: "hash",
	pl: "hash",
	yml: "hash",
	yaml: "hash",
	toml: "hash",
	ini: "hash",
	cfg: "hash",
	conf: "hash",
	properties: "hash",
	mk: "hash",
	mak: "hash",
	gitignore: "hash",
	npmrc: "hash",
	editorconfig: "hash",
	css: "block",
	scss: "block",
	less: "block",
	md: "html",
	mdc: "html",
	mdx: "jsx",
	html: "html",
	xml: "html",
	plist: "html",
	svg: "html",
	vue: "html",
	sql: "sql",
	applescript: "sql",
	iss: "semicolon",
};

const STYLE_BY_BASENAME = {
	Makefile: "hash",
	Dockerfile: "hash",
	Containerfile: "hash",
	OWNERS: "hash",
	".worktreeinclude": "hash",
	".gitignore": "hash",
	".understandignore": "hash",
	".npmrc": "hash",
	".editorconfig": "hash",
	".gitattributes": "hash",
	".dockerignore": "hash",
	".prettierignore": "hash",
};

// 无法/不应携带文件头声明的路径：由本清单兜底，NOTICE 中作整体说明。
const EXCLUDED_PATH_RULES = [
	{ pattern: /^exprot\//, reason: "历史研究归档" },
	{ pattern: /^patches\//, reason: "bun patch 生成的第三方差异，加声明头会破坏补丁可应用性" },
	{ pattern: /^\.github\/release-notes\//, reason: "Release 正文（含上游已发布原文）" },
	{ pattern: /^NOTICE$/, reason: "声明载体本身" },
	{ pattern: /^LICENSE$/, reason: "许可证正文" },
	{ pattern: /^docs\/legal\//, reason: "法务原文" },
	{ pattern: /^temp\//, reason: "未入库草稿与资产暂存" },
];

const NON_COMMENTABLE_EXTENSIONS = new Set([
	"json",
	"jsonl",
	"lock",
	"sum",
	"txt",
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"ico",
	"icns",
	"bmp",
	"woff",
	"woff2",
	"ttf",
	"otf",
	"eot",
	"mp3",
	"wav",
	"ogg",
	"mp4",
	"webm",
	"zip",
	"gz",
	"tgz",
	"tar",
	"rar",
	"7z",
	"wasm",
	"map",
	"pdf",
	"jar",
	"bin",
	"dmg",
	"exe",
	"msi",
	"deb",
	"rpm",
]);

function fileExtension(path) {
	const base = path.split("/").pop();
	const dot = base.lastIndexOf(".");
	if (dot <= 0) return "";
	return base.slice(dot + 1).toLowerCase();
}

export function styleForPath(path) {
	const base = path.split("/").pop();
	if (STYLE_BY_BASENAME[base]) return LINE_STYLES[STYLE_BY_BASENAME[base]];
	// dotenv 家族（.env、.env.example、.env.local……）统一 hash 注释。
	if (/^\.env(?:\.|$)/.test(base)) return LINE_STYLES.hash;
	const ext = fileExtension(path);
	const style = STYLE_BY_EXTENSION[ext];
	return style ? LINE_STYLES[style] : null;
}

export function exclusionReason(path) {
	const rule = EXCLUDED_PATH_RULES.find(({ pattern }) => pattern.test(path));
	if (rule) return rule.reason;
	if (NON_COMMENTABLE_EXTENSIONS.has(fileExtension(path))) return "格式不支持注释";
	return null;
}

function git(args) {
	return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

export function upstreamMergeBase() {
	try {
		return git(["merge-base", "upstream/dev", "HEAD"]).trim();
	} catch {
		throw new Error("无法解析 upstream/dev 的 merge-base；先运行 git fetch upstream");
	}
}

const BASELINE_SHA_PREFIX = "# merge-base: ";

function readBaselineSha(baselinePath) {
	const content = readFileSync(baselinePath, "utf8");
	for (const line of content.split("\n")) {
		if (line.startsWith(BASELINE_SHA_PREFIX)) return line.slice(BASELINE_SHA_PREFIX.length).trim();
	}
	return null;
}

function readBaselinePaths(baselinePath) {
	const paths = new Set();
	for (const line of readFileSync(baselinePath, "utf8").split("\n")) {
		const trimmed = line.trim();
		if (trimmed && !trimmed.startsWith("#")) paths.add(trimmed);
	}
	return paths;
}

function writeBaseline(baselinePath, mergeBase, missing) {
	const lines = [
		"# modified-file-notices ratchet baseline（ISSUE-0023）",
		"# 快照内路径豁免新增门禁；快照之外的新缺失仍会判负。",
		"# 修复声明头后可运行 --write-baseline 收缩本文件；安静窗口一次性 sweep 后删除。",
		`${BASELINE_SHA_PREFIX}${mergeBase}`,
		...missing.map((entry) => entry.path).sort(),
		"",
	];
	writeFileSync(baselinePath, lines.join("\n"));
}

export function listForkChanges(mergeBase) {
	const changes = new Map();
	const diff = git(["diff", "--name-status", "-M", mergeBase]);
	for (const line of diff.split("\n")) {
		if (!line.trim()) continue;
		const [status, ...rest] = line.split("\t");
		const path = rest.at(-1).replaceAll("\\", "/");
		if (!path) continue;
		if (status === "D") continue;
		changes.set(path, status.startsWith("A") ? "added" : "modified");
	}
	for (const path of git(["ls-files", "--others", "--exclude-standard"]).split("\n")) {
		const normalized = path.trim().replaceAll("\\", "/");
		if (normalized && !changes.has(normalized)) changes.set(normalized, "added");
	}
	return [...changes.entries()].map(([path, kind]) => ({ path, kind }));
}

function insertionIndex(lines, path) {
	if (lines[0]?.startsWith("#!")) return 1;
	// XML 声明必须是文件首字节，注释只能落在其后。
	if (/^<\?xml[\s?]/.test(lines[0] ?? "") || fileExtension(path) === "plist") {
		return lines[0]?.startsWith("<?xml") ? 1 : 0;
	}
	// YAML frontmatter 的 --- 必须是 Markdown 文件首行，声明插到闭合 --- 之后。
	if (lines[0] === "---") {
		const closing = lines.findIndex((line, index) => index > 0 && line === "---");
		if (closing > 0) return closing + 1;
	}
	return 0;
}

export function fileHasNotice(content) {
	return content.slice(0, 4096).includes(NOTICE_MARKER);
}

export function auditEntry({ path, kind }) {
	const reason = exclusionReason(path);
	if (reason) return { path, kind, status: "excluded", reason };
	const style = styleForPath(path);
	if (!style) return { path, kind, status: "unclassified" };
	const content = readFileSync(path, "utf8");
	return fileHasNotice(content) ? { path, kind, status: "covered" } : { path, kind, status: "missing", style };
}

function writeNotice(entry) {
	const content = readFileSync(entry.path, "utf8");
	const eol = content.includes("\r\n") ? "\r\n" : "\n";
	const lines = content.split(/\r?\n/);
	const notice = entry.kind === "added" ? ADDED_NOTICE : MODIFIED_NOTICE;
	lines.splice(insertionIndex(lines, entry.path), 0, entry.style.render(notice));
	writeFileSync(entry.path, lines.join(eol));
}

export function audit(changes) {
	const entries = changes.map(auditEntry);
	const missing = entries.filter((entry) => entry.status === "missing");
	const unclassified = entries.filter((entry) => entry.status === "unclassified");
	return { entries, missing, unclassified };
}

function argValue(flag) {
	const index = process.argv.indexOf(flag);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

function resolveMergeBase(baselinePath) {
	try {
		return upstreamMergeBase();
	} catch (error) {
		if (!baselinePath) throw error;
		// 门禁环境下可能没有 upstream remote（外部贡献者/CI 浅克隆）：
		// 回落到基线文件记录的 sha；commit 对象不在则放行并告警。
		const recorded = readBaselineSha(baselinePath);
		if (!recorded) throw error;
		try {
			git(["cat-file", "-e", `${recorded}^{commit}`]);
		} catch {
			console.warn(
				`[modified-file-notices] upstream merge-base 与基线 sha 均不可用，跳过审计（请先 git fetch upstream）`,
			);
			return null;
		}
		return recorded;
	}
}

function main() {
	const write = process.argv.includes("--write");
	const baselinePath = argValue("--baseline");
	const writeBaselinePath = argValue("--write-baseline");
	const mergeBase = resolveMergeBase(baselinePath ?? writeBaselinePath);
	if (mergeBase === null) {
		process.exitCode = 0;
		return;
	}
	const changes = listForkChanges(mergeBase);
	const { entries, missing, unclassified } = audit(changes);
	const covered = entries.filter((entry) => entry.status === "covered");
	const excluded = entries.filter((entry) => entry.status === "excluded");

	console.log(`baseline: upstream/dev@${mergeBase.slice(0, 12)}`);
	console.log(
		`changed=${changes.length} covered=${covered.length} excluded=${excluded.length} missing=${missing.length} unclassified=${unclassified.length}`,
	);

	if (writeBaselinePath) {
		writeBaseline(writeBaselinePath, mergeBase, missing);
		console.log(`\n已把 ${missing.length} 条缺失快照写入 ${writeBaselinePath}。`);
		process.exitCode = unclassified.length > 0 ? 1 : 0;
		return;
	}

	if (unclassified.length > 0) {
		console.error("\n未归类（需人工确认注释风格或加入白名单）:");
		for (const entry of unclassified) console.error(`  ${entry.kind}\t${entry.path}`);
	}
	if (write) {
		for (const entry of missing) writeNotice(entry);
		console.log(`\n已为 ${missing.length} 个文件写入声明头；请重跑审计确认。`);
		process.exitCode = unclassified.length > 0 ? 1 : 0;
		return;
	}
	let actionable = missing;
	if (baselinePath) {
		const waived = readBaselinePaths(baselinePath);
		actionable = missing.filter((entry) => !waived.has(entry.path));
		const resolved = [...waived].filter((path) => !missing.some((entry) => entry.path === path));
		console.log(`ratchet: waived=${missing.length - actionable.length} new=${actionable.length}`);
		if (resolved.length > 0) {
			console.log(`\n基线中已修复 ${resolved.length} 条，可运行 --write-baseline 收缩快照。`);
		}
	}
	if (actionable.length > 0) {
		console.error(`\n缺少声明头${baselinePath ? "（基线之外的新增）" : ""}:`);
		for (const entry of actionable) console.error(`  ${entry.kind}\t${entry.path}`);
	}
	process.exitCode = actionable.length > 0 || unclassified.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main();
}
