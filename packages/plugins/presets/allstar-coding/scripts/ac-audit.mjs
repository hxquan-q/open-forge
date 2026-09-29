#!/usr/bin/env node
// Copyright The Open Forge contributors.
/**
 * ac-audit.mjs — AllstarCoding 流水线硬校验审计脚本（设计文档 v0.4 §9.7/§9.8 L1.5）
 *
 * 职责：把「纪律文本」升维为「机器可审计的账本核对」。主控（allstar）在关键节点以只读方式调用，
 * 输出结构化结果（PASS / 越权清单 + 建议处置），报告贴进对话供 ac-gate 留档。
 *
 * 实现的校验节点：
 *   V2 环节收口   —— 双证据链比对：证据链 A（git 轨迹）∪ 证据链 B（mtime 扫描）⊆? 参与角色写域并集
 *   V3 评审前快照 —— git status/diff --stat 快照 ⊆? 开发子契约 scope
 *   V4 存档点     —— checkpoint 提交后 diff --name-only HEAD~1 ⊆? 该 T 写域并集
 *
 * 权限基线（设计文档 §9.2 角色权限矩阵 v1，机器可判子集）：
 *   角色写域以 glob 声明，路径统一相对目标项目根。git 写操作不进任何子代理写域（全收主控侧）。
 *
 * 本脚本自身只读（git log/diff/status + 文件扫描），不做任何写操作、不修改任何文件。
 *
 * 用法（node ≥ 20，在目标项目根或任意目录调用，--project 指向目标项目根）：
 *   node tools/ac-audit.mjs gate   --project <项目根> --since "<ISO时间>" [--until "<ISO时间>"] [--roles developer,reviewer]
 *   node tools/ac-audit.mjs snapshot --project <项目根> --scope "<glob>,<glob>"
 *   node tools/ac-audit.mjs checkpoint --project <项目根> [--scope "<glob>,<glob>"]
 *   node tools/ac-audit.mjs matrix  --project <项目根>   （打印权限矩阵写域，供任务书拼装时对照）
 *
 * 退出码：0 = PASS；1 = 发现越权/违规项；2 = 用法/环境错误（无法完成校验，视为不放行）。
 */

import { spawnSync } from "node:child_process";
import { closeSync, openSync, readFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, normalize, relative, resolve, sep } from "node:path";

// ---------------------------------------------------------------------------
// 通用工具
// ---------------------------------------------------------------------------

const EXIT = { PASS: 0, VIOLATION: 1, ERROR: 2 };

/** 命令行参数解析：--key value（值可带引号由 shell 处理，这里只认裸值）。 */
function parseArgs(argv) {
	const args = {};
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		if (!token || !token.startsWith("--")) continue;
		const key = token.slice(2);
		const next = argv[i + 1];
		if (next !== undefined && !next.startsWith("--")) {
			args[key] = next;
			i += 1;
		} else {
			args[key] = true;
		}
	}
	return args;
}

/**
 * 沙箱友好版 git：spawnSync + 文件描述符 stdio（不走管道）。
 * 权限沙箱会拒绝子进程的 pipe stdio（EPERM），fd 重定向到临时文件不受影响——
 * 本脚本的宿主环境（Vetta 主控会话）正是该沙箱，必须用这种方式拿输出。
 * 全部只读子命令；输出经工作区临时文件回收（OS 临时目录，读完即删）。
 */
function git(cwd, ...args) {
	const tmpOut = join(tmpdir(), `ac-audit-git-${process.pid}-${Date.now()}.out`);
	const tmpErr = join(tmpdir(), `ac-audit-git-${process.pid}-${Date.now()}.err`);
	const fdOut = openSync(tmpOut, "w");
	const fdErr = openSync(tmpErr, "w");
	try {
		const result = spawnSync("git", args, { cwd, stdio: ["ignore", fdOut, fdErr], encoding: null });
		if (result.error || result.status !== 0) {
			const stderr = safeRead(tmpErr);
			throw new Error(
				`git ${args.join(" ")} failed in ${cwd}: ${stderr || result.error?.message || `exit ${result.status}`}`,
			);
		}
		return safeRead(tmpOut);
	} finally {
		closeSync(fdOut);
		closeSync(fdErr);
		unlinkSync(tmpOut);
		unlinkSync(tmpErr);
	}
}

function safeRead(path) {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return "";
	}
}

/** 把任意输入路径规范成相对项目根的 POSIX 风格路径；项目外路径返回 null。 */
function toRel(root, path) {
	const abs = isAbsolute(path) ? path : resolve(root, path);
	const rel = normalize(relative(root, abs));
	if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
	return rel.split(sep).join("/");
}

/**
 * glob 转 RegExp。支持子集：双星跨目录、单星段内通配、问号单字符、花括号组。
 * 例：docs/ac/prototype/ 下任意层级，或 src 下所有 ts/tsx。写域声明保守，未匹配即越权。
 */
function globToRegExp(pattern) {
	let re = "";
	let i = 0;
	while (i < pattern.length) {
		const ch = pattern[i];
		if (ch === "*") {
			if (pattern[i + 1] === "*") {
				// 双星斜杠或裸双星：跨目录任意段（含零段）
				if (pattern[i + 2] === "/") {
					re += "(?:[^/]+/)*";
					i += 3;
				} else {
					// 尾部 /**：目录本体与其下全部内容（本体匹配由 matches() 的前缀语义兜底，
					// 这里保证"目录/xxx"也命中；写成 .* 即可）
					re += ".*";
					i += 2;
				}
			} else {
				re += "[^/]*";
				i += 1;
			}
		} else if (ch === "?") {
			re += "[^/]";
			i += 1;
		} else if (ch === "{") {
			const end = pattern.indexOf("}", i);
			if (end === -1) {
				re += "\\{";
				i += 1;
			} else {
				const group = pattern
					.slice(i + 1, end)
					.split(",")
					.map((alt) => {
						// 递归生成的是完整正则（含 ^$ 锚），剥掉锚只留主体
						const src = globToRegExp(alt).source;
						return src.startsWith("^") && src.endsWith("$") ? src.slice(1, -1) : src;
					})
					.join("|");
				re += `(?:${group})`;
				i = end + 1;
			}
		} else {
			re += ch.replace(/[.+^$()|[\]\\]/g, "\\$&");
			i += 1;
		}
	}
	return new RegExp(`^${re}$`);
}

/** 按逗号分割 scope 列表，但跳过花括号组内的逗号（{ts,tsx} 是一个 pattern 的一部分）。 */
function splitScopeList(raw) {
	const parts = [];
	let depth = 0;
	let current = "";
	for (const ch of String(raw ?? "")) {
		if (ch === "{") depth += 1;
		if (ch === "}") depth = Math.max(0, depth - 1);
		if (ch === "," && depth === 0) {
			parts.push(current);
			current = "";
		} else {
			current += ch;
		}
	}
	if (current.trim()) parts.push(current);
	return parts;
}

/** glob 列表 → 匹配器（含「精确路径也是合法 scope 条目」语义；目录含其全部后代）。 */
function compileScope(patterns) {
	const list = (Array.isArray(patterns) ? patterns : splitScopeList(patterns))
		.map((p) => String(p).trim())
		.filter(Boolean);
	return {
		patterns: list,
		/** 命中任一 pattern 即在写域内。 */
		matches(path) {
			return list.some((pattern) => {
				if (pattern.includes("*") || pattern.includes("?") || pattern.includes("{")) {
					if (globToRegExp(pattern).test(path)) return true;
					// 目录本体语义：`dir/**` 的本体（dir 自身）也算写域内
					const base = pattern.replace(/\/\*\*$/, "");
					return base !== pattern && base === path;
				}
				return pattern === path || path.startsWith(`${pattern}/`);
			});
		},
	};
}

// ---------------------------------------------------------------------------
// 权限矩阵（设计文档 §9.2 角色权限矩阵 v1 的机器可判子集）
// ---------------------------------------------------------------------------

/**
 * 注意：这是「基线矩阵」——主控派发时可在任务契约 scope 里收紧（白名单交集语义），
 * 但不可放宽超过本矩阵（V1 派发前校验的对象；L2 化后由工具拦截层强制）。
 */
const BASELINE_MATRIX = {
	conductor: { tier: "T1", write: ["docs/ac/state.md"] },
	requirements: {
		tier: "T2",
		write: ["docs/ac/originModel.html", "docs/ac/requires.md", "docs/ac/prototype/**"],
	},
	architect: { tier: "T1", write: ["docs/ac/design.md"] },
	taskplanner: { tier: "T1", write: ["docs/ac/tasks.md"] },
	developer: { tier: "T2", write: [] /* 契约 scope 动态下发（项目内 glob） */ },
	reviewer: { tier: "T2", write: ["docs/ac/reviews.md"] },
	whitebox: {
		tier: "T2",
		write: ["docs/ac/whitebox.md", "docs/ac/test-results/**", "test/**", "tests/**"],
	},
	blackbox: { tier: "T1", write: ["docs/ac/blackbox.md"] },
	deployer: { tier: "T2", write: [] /* 部署分支与产物路径，按项目实际动态下发 */ },
	finalizer: {
		tier: "T2",
		write: [] /* state.md 终态化（主控显式授权的一次性交接）+ 临时物清理，动态下发 */
	},
	assistant: { tier: "T2", write: [] /* 每次委派由主控在契约中下发 scope */ },
};

const ROLE_LABELS = {
	conductor: "主控",
	requirements: "需求子",
	architect: "架构子",
	taskplanner: "任务子",
	developer: "开发子",
	reviewer: "评审子",
	whitebox: "白盒子",
	blackbox: "黑盒子",
	deployer: "部署子",
	finalizer: "收尾子",
	assistant: "辅助者",
};

function matrixScopeFor(roles) {
	const list = Array.isArray(roles) ? roles : String(roles ?? "").split(",");
	const merged = new Set();
	for (const role of list) {
		const key = String(role).trim();
		if (!key) continue;
		const entry = BASELINE_MATRIX[key];
		if (!entry) continue; // 未知角色：无基线写域（动态 scope 才可能放行）
		for (const pattern of entry.write) merged.add(pattern);
	}
	return compileScope([...merged]);
}

// ---------------------------------------------------------------------------
// 证据链 A：git 轨迹
// ---------------------------------------------------------------------------

/**
 * 环节开始后的提交改动集（V2 链 A）。
 * `git log --name-only --pretty=format:... --since` 在 Windows/跨时区下对 author-date 的解析
 * 不稳定，改为读取提交的 commit-date（ISO 严格）后在 JS 侧重过滤——确定性优先。
 */
function gitChangesSince(root, sinceISO, untilISO) {
	const since = Date.parse(sinceISO);
	if (Number.isNaN(since)) throw new Error(`invalid --since timestamp: ${sinceISO}`);
	const until = untilISO ? Date.parse(untilISO) : Number.POSITIVE_INFINITY;
	if (Number.isNaN(until)) throw new Error(`invalid --until timestamp: ${untilISO}`);

	const out = git(root, "log", "--name-only", "--no-renames", "--pretty=format:%x01%cI%x02");
	const changed = new Set();
	for (const record of out.split("\x01")) {
		if (!record.trim()) continue;
		// 每段形如 "<ISO日期>\x02\n<文件1>\n<文件2>..."——日期在前，\x02 是日期/文件清单的分隔
		const separator = record.indexOf("\x02");
		if (separator === -1) continue;
		const commitDate = Date.parse(record.slice(0, separator).trim());
		if (Number.isNaN(commitDate) || commitDate < since || commitDate > until) continue;
		for (const line of record.slice(separator + 1).split("\n")) {
			const file = line.trim();
			if (file && !file.startsWith("docs/ac/state.md")) {
				// state.md 由主控每步更新，属预期写入，不作为子代理越权证据（V2 的比对对象是子代理写域）
				changed.add(file);
			}
		}
	}
	return [...changed].sort();
}

/** 工作区当前未提交改动快照（V3）：status porcelain（-uall 展开未跟踪目录，防折叠成目录名）。 */
function gitWorkingChanges(root) {
	const changed = new Set();
	const status = git(root, "status", "--porcelain", "-uall");
	for (const line of status.split("\n")) {
		if (!line.trim()) continue;
		const file = line.slice(3).trim().replace(/^"|"$/g, "");
		if (!file) continue;
		// 重命名记作两侧；删除记作改动（越权删除同样是越权）
		const paths = file.split(" -> ");
		for (const p of paths) if (p && !p.startsWith("docs/ac/state.md")) changed.add(p);
	}
	return [...changed].sort();
}

/** 最近一次提交（checkpoint）的改动集（V4）。 */
function gitCheckpointChanges(root) {
	const out = git(root, "diff", "--name-only", "HEAD~1", "HEAD", "--no-renames");
	return out
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l && !l.startsWith("docs/ac/state.md"))
		.sort();
}

// ---------------------------------------------------------------------------
// 证据链 B：mtime 扫描
// ---------------------------------------------------------------------------

const MTIME_SCAN_SKIP_DIRS = new Set([
	".git",
	"node_modules",
	"dist",
	"build",
	"out",
	"release",
	".cache",
	".turbo",
	".venv",
	"__pycache__",
	".next",
	".svelte-kit",
	"coverage",
	"target",
]);

/** 递归扫描 mtime > since 的文件（排除 .git/node_modules 等非证据目录）。 */
function scanModifiedSince(root, sinceISO) {
	const since = Date.parse(sinceISO);
	if (Number.isNaN(since)) throw new Error(`invalid timestamp: ${sinceISO}`);
	const found = [];
	const walk = (dir) => {
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return; // 无权限/消失的目录：跳过（只读扫描不制造噪音）
		}
		for (const entry of entries) {
			const full = join(dir, entry.name);
			const rel = toRel(root, full);
			if (rel === null) continue;
			if (entry.isDirectory()) {
				if (MTIME_SCAN_SKIP_DIRS.has(entry.name)) continue;
				walk(full);
			} else if (entry.isFile()) {
				try {
					const mtime = statSync(full).mtimeMs;
					if (mtime > since && !rel.startsWith("docs/ac/state.md")) found.push(rel);
				} catch {
					/* 文件消失：跳过 */
				}
			}
		}
	};
	walk(root);
	return found.sort();
}

// ---------------------------------------------------------------------------
// V2 / V3 / V4 校验节点
// ---------------------------------------------------------------------------

function classify(files, scope, allowOutOfScope) {
	const inScope = [];
	const outOfScope = [];
	for (const file of files) {
		if (scope.matches(file)) inScope.push(file);
		else outOfScope.push(file);
	}
	return { inScope, outOfScope, pass: allowOutOfScope ? true : outOfScope.length === 0 };
}

function evidenceFromGitStatus(root) {
	try {
		return git(root, "status", "--porcelain").trim();
	} catch {
		return "(git status 不可用)";
	}
}

/** V2 环节收口：双链并集 ⊆? 参与角色写域并集。 */
function runGate({ root, since, until, roles, extraScope, allowOutOfScope }) {
	const scope = matrixScopeFor(roles);
	const contract = compileScope(extraScope ?? []);
	const union = {
		matches(path) {
			return scope.matches(path) || contract.matches(path);
		},
	};

	const chainA = gitChangesSince(root, since, until);
	const chainB = scanModifiedSince(root, since);
	const unionSet = [...new Set([...chainA, ...chainB])].sort();
	const verdict = classify(unionSet, union, allowOutOfScope);

	return {
		node: "V2-gate",
		root,
		since,
		until: until ?? "(now)",
		roles: String(roles),
		scopePatterns: [...scope.patterns, ...contract.patterns],
		chainA: { source: "git log since startedAt", files: chainA },
		chainB: { source: "mtime > startedAt (state.md excluded)", files: chainB },
		union: unionSet,
		...verdict,
	};
}

/** V3 评审前快照：当前未提交改动 ⊆? 开发子契约 scope。 */
function runSnapshot({ root, scope, allowOutOfScope }) {
	const contract = compileScope(scope);
	const files = gitWorkingChanges(root);
	const verdict = classify(files, contract, allowOutOfScope);
	return {
		node: "V3-snapshot",
		root,
		scopePatterns: contract.patterns,
		gitStatus: evidenceFromGitStatus(root),
		files,
		...verdict,
	};
}

/** V4 存档点：最近一次 checkpoint 提交改动 ⊆? 该 T 写域并集。 */
function runCheckpoint({ root, scope, allowOutOfScope }) {
	const contract = compileScope(scope);
	const files = gitCheckpointChanges(root);
	const verdict = classify(files, contract, allowOutOfScope);
	return {
		node: "V4-checkpoint",
		root,
		scopePatterns: contract.patterns,
		files,
		...verdict,
	};
}

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------

function render(result) {
	const lines = [];
	lines.push(`# ${result.node} 校验报告`);
	lines.push("");
	if (result.node === "V2-gate") {
		lines.push(`- 项目根: ${result.root}`);
		lines.push(`- 时间锚: since ${result.since} → until ${result.until}`);
		lines.push(`- 参与角色: ${result.roles}`);
		lines.push(`- 写域 patterns: ${result.scopePatterns.join(", ") || "(空)"}`);
		lines.push("");
		lines.push(`## 证据链 A（git 轨迹，${result.chainA.files.length} 文件）`);
		lines.push(result.chainA.files.length ? result.chainA.files.map((f) => `- ${f}`).join("\n") : "- (无)");
		lines.push("");
		lines.push(`## 证据链 B（mtime 扫描，${result.chainB.files.length} 文件）`);
		lines.push(result.chainB.files.length ? result.chainB.files.map((f) => `- ${f}`).join("\n") : "- (无)");
		lines.push("");
		lines.push(`## 双链并集（${result.union.length} 文件）⊆ 写域判定`);
	} else {
		lines.push(`- 项目根: ${result.root}`);
		lines.push(`- scope patterns: ${result.scopePatterns.join(", ") || "(空)"}`);
		if (result.gitStatus !== undefined) {
			lines.push("");
			lines.push("## git status 快照");
			lines.push("```");
			lines.push(result.gitStatus);
			lines.push("```");
		}
		lines.push("");
		lines.push(`## 改动文件（${result.files.length}）⊆ scope 判定`);
	}
	const inScope = result.inScope ?? [];
	const outOfScope = result.outOfScope ?? [];
	lines.push(inScope.length ? inScope.map((f) => `- ✅ ${f}`).join("\n") : "- (无域内改动)");
	if (outOfScope.length) {
		lines.push("");
		lines.push(`## ❌ 越权清单（${outOfScope.length}）`);
		lines.push(outOfScope.map((f) => `- ${f}`).join("\n"));
		lines.push("");
		lines.push("建议处置：按越权处置 SOP（ac-pipeline §0.6）执行——冻结 → 核查 → 订正 → 记录 → 继续；必要时上报用户门。");
	}
	lines.push("");
	lines.push(`**结论: ${result.pass ? "PASS ✅" : "FAIL ❌（存在越权改动，不放行）"}**`);
	return lines.join("\n");
}

function renderMatrix() {
	const lines = ["# AC 角色权限矩阵 v1（基线写域，glob 相对项目根）", ""];
	lines.push("| 角色 | 档位 | 基线写域 |");
	lines.push("|------|------|----------|");
	for (const [role, entry] of Object.entries(BASELINE_MATRIX)) {
		const write = entry.write.length ? entry.write.join(", ") : "（契约动态下发）";
		lines.push(`| ${ROLE_LABELS[role] ?? role} (${role}) | ${entry.tier} | ${write} |`);
	}
	lines.push("");
	lines.push("规则：主控派发可在契约 scope 里收紧但不可超基线；git 写操作不进任何子代理写域（全收主控侧）；");
	lines.push("state.md 由主控写入，属预期写入，两条证据链均已排除。");
	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI 入口（也被测试 import：所有 run* / 工具函数具名导出，CLI 仅是薄壳）
// ---------------------------------------------------------------------------

export {
	BASELINE_MATRIX,
	ROLE_LABELS,
	compileScope,
	globToRegExp,
	gitChangesSince,
	gitCheckpointChanges,
	gitWorkingChanges,
	matrixScopeFor,
	runGate,
	runSnapshot,
	runCheckpoint,
	scanModifiedSince,
	splitScopeList,
	toRel,
};

function main(argv) {
	const args = parseArgs(argv);
	const command = argv[0];
	const project = args.project ? resolve(args.project) : process.cwd();

	try {
		if (command === "matrix") {
			console.log(renderMatrix());
			return EXIT.PASS;
		}

		if (!command || !["gate", "snapshot", "checkpoint"].includes(command)) {
			console.error("用法: ac-audit.mjs <gate|snapshot|checkpoint|matrix> --project <root> [参数]");
			console.error("  gate      --since <ISO> [--until <ISO>] [--roles developer,reviewer] [--scope <glob,...>]");
			console.error("  snapshot  --scope <glob,...>");
			console.error("  checkpoint --scope <glob,...>");
			return EXIT.ERROR;
		}

		let result;
		if (command === "gate") {
			if (!args.since) {
				console.error("gate 需要 --since <ISO时间>（取 state.md 该环节的 startedAt）");
				return EXIT.ERROR;
			}
			result = runGate({
				root: project,
				since: args.since,
				until: typeof args.until === "string" ? args.until : undefined,
				roles: typeof args.roles === "string" ? args.roles : "developer,reviewer",
				extraScope: typeof args.scope === "string" ? args.scope : "",
				allowOutOfScope: args["allow-out-of-scope"] === true,
			});
		} else if (command === "snapshot") {
			if (!args.scope) {
				console.error("snapshot 需要 --scope <glob,...>（开发子契约 scope）");
				return EXIT.ERROR;
			}
			result = runSnapshot({ root: project, scope: args.scope, allowOutOfScope: false });
		} else {
			result = runCheckpoint({ root: project, scope: args.scope, allowOutOfScope: false });
		}

		console.log(render(result));
		return result.pass ? EXIT.PASS : EXIT.VIOLATION;
	} catch (error) {
		console.error(`ac-audit: ${error instanceof Error ? error.message : String(error)}`);
		return EXIT.ERROR;
	}
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
	process.exit(main(process.argv.slice(2)));
}
