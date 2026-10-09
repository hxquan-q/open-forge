// Copyright The Open Forge contributors.
/**
 * ac-fence 判定器（ac-fence-spec §3）——纯函数，两路径共享（插件 hook 主路径 + 未来 CLI 扩展备选）。
 *
 * 纪律（§8 留接口约束）：本文件**不得 import 任何 plugin-sdk 类型**——输入用本地 ToolCallShape 接口，
 * 保证未来 `.vetta/extensions` 扩展文件可直接复用判定器。
 *
 * glob 语义来自 scripts/scope-glob.mjs（与 ac-audit 共用同一份权威实现——事中拦截与事后审计
 * 必须对同一 path 给出同一判定）。
 */

import { compileScope, splitScopeList, type ScopeMatcher } from "../../scripts/scope-glob.mjs";

// ---------------------------------------------------------------------------
// 类型（§3.1）
// ---------------------------------------------------------------------------

export type Role =
	| "conductor"
	| "requirements"
	| "architect"
	| "taskplanner"
	| "developer"
	| "reviewer"
	| "whitebox"
	| "blackbox"
	| "deployer"
	| "finalizer"
	| "assistant"
	| "unknown";

export interface FenceContract {
	/** 与 ac-audit BASELINE_MATRIX 键一致的角色标识。 */
	role: Role;
	/** snake_case 唯一名（如 "dev_t1"）。 */
	taskName: string;
	/** spawn 后回填（SubagentStart 事件的 agentId）。 */
	agentId?: string;
	/** "general" | "explorer" | ... */
	agentType: string;
	/** glob 列表（契约 task.scope 解析结果，相对项目根、POSIX 风格）。 */
	scope: string[];
	/** 该角色允许 spawn 的 agent_type（主控专用，本期未用）。 */
	spawnWhitelist?: string[];
	/**
	 * git 写操作豁免（环节级存档通道）：主控显式授权的轻量 git 子代理契约携带 true。
	 * 默认 false——普通子代理 git 写命令仍被拦（提交历史是流水线审计日志，打点权收主控侧）。
	 */
	gitWriteAllow?: boolean;
}

export interface ToolCallShape {
	/** event.tool.kind */
	toolKind: string;
	/** event.tool.hostName */
	hostName: string;
	/** event.toolInput */
	input: unknown;
}

export interface Verdict {
	allow: boolean;
	/** block 时必填，面向模型，含 help_protocol 指引。 */
	reason?: string;
}

// ---------------------------------------------------------------------------
// 权限矩阵（§3.6——从 ac-audit.mjs 原样搬，它是权限矩阵的机器权威源）
// ---------------------------------------------------------------------------

export const BASELINE_MATRIX: Record<string, { tier: string; write: string[]; read?: string[] }> = {
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
	// read 字段是黑盒自测迭代（TASK-0219）的最小读域标记：读类工具按前缀放行（§6.2 读域过滤）。
	// 目前只有 blackbox 声明——其他角色读全域语义不变；未来角色需要窄读域时在此登记。
	blackbox: {
		tier: "T1",
		write: ["docs/ac/blackbox.md"],
		read: ["docs/ac/"],
	},
	deployer: { tier: "T2", write: [] /* 部署分支与产物路径，按项目实际动态下发 */ },
	finalizer: {
		tier: "T2",
		write: [] /* state.md 终态化（主控显式授权的一次性交接）+ 临时物清理，动态下发 */,
	},
	assistant: { tier: "T2", write: [] /* 每次委派由主控在契约中下发 scope */ },
};

/** 写域为空的角色：有效域 = 仅 contract.scope（动态角色语义；unknown 同）。 */
const DYNAMIC_ROLES = new Set<Role>(["developer", "deployer", "finalizer", "assistant", "unknown"]);

/** 主控 spawn 子代理允许的 agent_type 白名单（§3.2 主会话规则）。 */
export const SPAWN_AGENT_TYPE_WHITELIST = new Set(["general", "explorer"]);

/** task_name 前缀 → 角色（§4.1 登记：role 从 task_name 前缀推断）。git_ = 轻量 git 子代理（assistant 动态角色 + git 写豁免）。 */
const TASK_NAME_PREFIX_ROLES: Array<[prefix: string, role: Role]> = [
	["req_", "requirements"],
	["arch_", "architect"],
	["plan_", "taskplanner"],
	["dev_", "developer"],
	["review_", "reviewer"],
	["wb_", "whitebox"],
	["bb_", "blackbox"],
	["dep_", "deployer"],
	["fin_", "finalizer"],
	["help_", "assistant"],
	["git_", "assistant"],
];

export function roleFromTaskName(taskName: string): Role {
	for (const [prefix, role] of TASK_NAME_PREFIX_ROLES) {
		if (taskName.startsWith(prefix)) return role;
	}
	return "unknown";
}

/** 未登记子会话允许的只读类宿主工具（§3.2；仅 function 类）。 */
const READONLY_HOST_NAMES = new Set([
	"read",
	"grep",
	"glob",
	"ls",
	"dir_tree",
	"find",
	"todo",
	"todo_read",
	"todo_write",
	"list_agents",
]);

/**
 * blackbox 角色的读域内放行工具（读域过滤 §6.2）：只有 read——用例路径由任务书点名，
 * 目录发现类（grep/glob/ls/dir_tree/find）一律拦，堵死模式化探查 src 的路径。
 */
const BLACKBOX_READABLE_HOST_NAMES = new Set(["read"]);

/**
 * blackbox 角色的 shell 白名单（§6.2）：黑测子自测通道之一是外部 CLI agent-browser（headless），
 * 且它不需要 git（读也不需要——审计在主控侧）。未来新通道需要其他命令时，白名单加条目即可。
 */
const BLACKBOX_SHELL_WHITELIST = new Set(["agent-browser"]);

// ---------------------------------------------------------------------------
// git 写命令黑名单（§3.3）
// ---------------------------------------------------------------------------

/**
 * git 写子命令集合（§3.3 清白名单式实现：先提取子命令，子命令 ∈ 写集合才 block——
 * `git status/log/diff/show/blame` 等只读命令天然放行）。
 * 拿不准就从严（block），reason 写明可申诉。
 */
const GIT_WRITE_SUBCOMMANDS = new Set([
	"add",
	"commit",
	"push",
	"pull",
	"merge",
	"rebase",
	"restore",
	"reset",
	"checkout",
	"switch",
	"clean",
	"stash",
	"branch",
	"tag",
	"cherry-pick",
	"revert",
	"mv",
	"rm",
	"gc",
	"filter-branch",
]);

/** 取值后还需一个参数的全局 flag（`git -C <path> commit` 类场景不能把 path 当子命令）。 */
const GIT_GLOBAL_FLAGS_WITH_VALUE = new Set(["-c", "-C", "--git-dir", "--work-tree", "--namespace", "--exec-path"]);

const GIT_WORD_RE = /\bgit(?:\.exe)?(?=[\s"']|$)/gi;

/** 提取 `git` 之后第一个非 flag 的裸子命令 token；无子命令返回 null。 */
function gitSubcommandAfter(rest: string): { sub: string; rest: string } | null {
	const tokens = rest.split(/\s+/).filter(Boolean);
	let i = 0;
	while (i < tokens.length) {
		let token = tokens[i];
		i += 1;
		// 剥引号（cmd /c "git commit" 场景）
		token = token.replace(/^["']|["']$/g, "");
		if (!token) continue;
		if (token.startsWith("-")) {
			// flag：自身带值（--git-dir=x）跳过即可；取值型 flag（-C/--work-tree）再吞下一个 token
			if (GIT_GLOBAL_FLAGS_WITH_VALUE.has(token) && i < tokens.length) i += 1;
			continue;
		}
		if (/^[a-z][a-z-]*$/i.test(token)) {
			return { sub: token.toLowerCase(), rest: tokens.slice(i).join(" ") };
		}
		return null; // 第一个非 flag token 不是子命令形态（如路径）——该处 git 调用无子命令
	}
	return null;
}

/**
 * 命令串是否含 git 写操作（§3.3）。
 * 容忍：`git` 前有路径/环境变量前缀（`GIT_EXTERNAL_DIFF=... git status` 放行——\b 对
 * `GIT_EXTERNAL_DIFF` 不命中，因为下划线是 word 字符）、`cmd /c "git commit"` 引号包裹、
 * `git.exe`、`git -C <path> <子命令>` 全局 flag。`reflog` 仅 `expire` 判写。
 */
export function isGitWriteCommand(command: string): boolean {
	if (typeof command !== "string" || command.length === 0) return false;
	GIT_WORD_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = GIT_WORD_RE.exec(command)) !== null) {
		const found = gitSubcommandAfter(command.slice(match.index + match[0].length));
		if (!found) continue;
		if (GIT_WRITE_SUBCOMMANDS.has(found.sub)) return true;
		if (found.sub === "reflog") {
			// reflog expire 是写（gc 的危险近亲）；reflog/reflog show 只读
			const next = gitSubcommandAfter(found.rest);
			if (next?.sub === "expire") return true;
		}
	}
	return false;
}

// ---------------------------------------------------------------------------
// 内部工具
// ---------------------------------------------------------------------------

const HELP_PROTOCOL_HINT = "走 help_protocol：在最终报告「待主控处理」节登记（诉求、理由、被拒信息原文），等待主控裁决；不自行变通。";

/** POSIX 化 + 去掉 `./` 前缀。绝对路径不转换——相对 scope 模式天然不命中（fail-safe）。 */
function toPosixPath(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function isFileEditCall(call: ToolCallShape): boolean {
	return call.toolKind === "file-edit" || call.hostName === "edit" || call.hostName === "write";
}

function isShellCall(call: ToolCallShape): boolean {
	return call.toolKind === "shell" || call.hostName === "bash";
}

function isAgentCall(call: ToolCallShape): boolean {
	return call.toolKind === "agent" || call.hostName === "spawn_agent";
}

/** 从 input 里断言 string 字段（断言失败返回 null）。 */
function stringField(input: unknown, key: string): string | null {
	if (typeof input !== "object" || input === null) return null;
	const value = (input as Record<string, unknown>)[key];
	return typeof value === "string" ? value : null;
}

/** 从 input 里断言 boolean 字段（断言失败返回 null）。 */
function booleanField(input: unknown, key: string): boolean | null {
	if (typeof input !== "object" || input === null) return null;
	const value = (input as Record<string, unknown>)[key];
	return typeof value === "boolean" ? value : null;
}

/**
 * allow_git_write 豁免字段读取（P2-2 统一）：规范位置是 spawn 输入**根层**（与 task_name 平级），
 * 同时兼容历史措辞「契约带」被解读为 task 契约内部的情形——两处取或。
 * 派发校验（judgeMainSpawn）与契约登记（contractFromSpawnInput）共用本函数，避免对「字段在哪」再次分歧导致
 * 豁免通道静默失效（git 子代理提交被拦 → 环节级存档落不了地）。
 */
export function readGitWriteExemption(input: unknown): boolean {
	if (booleanField(input, "allow_git_write") === true) return true;
	if (typeof input !== "object" || input === null) return false;
	return booleanField((input as Record<string, unknown>).task, "allow_git_write") === true;
}

/** file-edit 输入的 path 字段（宿主工具以 path 为准，file_path 作兼容回退）。 */
function editPath(input: unknown): string | null {
	const path = stringField(input, "path");
	if (path !== null) return path;
	return stringField(input, "file_path");
}

/** 契约 task.scope 解析：字符串（逗号分隔）或数组 → glob 列表（§1.2 约定）。 */
export function parseScopeInput(raw: unknown): string[] {
	if (typeof raw === "string") {
		return splitScopeList(raw)
			.map((p) => p.trim())
			.filter(Boolean);
	}
	if (Array.isArray(raw)) {
		return raw.filter((p): p is string => typeof p === "string").map((p) => p.trim()).filter(Boolean);
	}
	return [];
}

/** 项目内 glob 判定：拒绝绝对路径 / `..` 逃逸 / `~`（动态角色的 scope 约束）。 */
export function isProjectInternalGlob(pattern: string): boolean {
	const posix = toPosixPath(pattern);
	if (posix.length === 0) return false;
	if (posix.startsWith("/") || posix.startsWith("~")) return false;
	if (/^[A-Za-z]:/.test(posix)) return false;
	if (posix === ".." || posix.startsWith("../")) return false;
	return true;
}

/** 有效写域（§3.6）：动态角色 = 仅 contract.scope；静态角色 = 基线 ∩ scope（收紧可以、放宽违规）。 */
function effectiveWriteScope(contract: FenceContract): ScopeMatcher {
	const contractScope = compileScope(contract.scope.map(toPosixPath));
	const baseline = BASELINE_MATRIX[contract.role]?.write ?? [];
	if (baseline.length === 0) return contractScope;
	const baselineScope = compileScope(baseline);
	return {
		patterns: contractScope.patterns,
		matches: (path: string) => baselineScope.matches(path) && contractScope.matches(path),
	};
}

// ---------------------------------------------------------------------------
// blackbox 角色窄读域/白名单（黑盒自测迭代 §6.2——仅该角色生效，其他角色行为不变）
// ---------------------------------------------------------------------------

/**
 * 读类宿主工具（toolKind function）的 path 参数提取：宿主 read 以 path 为准，file_path 作兼容回退。
 * path 缺失或不可解析 → 由调用方 fail-safe block。
 */
function readCallPath(input: unknown): string | null {
	const path = stringField(input, "path");
	if (path !== null && path.trim() !== "") return path;
	const filePath = stringField(input, "file_path");
	if (filePath !== null && filePath.trim() !== "") return filePath;
	return null;
}

/** blackbox 读域判定（§6.2）：path（POSIX 化后）落在任一 read 前缀内才放行。 */
function isWithinBlackboxReadScope(path: string): boolean {
	const posix = toPosixPath(path.trim());
	if (posix.length === 0) return false;
	// fail-safe（BUG-0082）：绝对路径与任何 .. 段先拒——词法前缀匹配挡不住
	// `docs/ac/../../src/main.ts` 这类穿越（宿主 resolve 后实际读到域外）。
	// 不做完整规范化：宁可误拦合法的 `docs/ac/a/../b.md`（罕见），不可漏放穿越。
	if (posix.startsWith("/") || posix.startsWith("~") || /^[A-Za-z]:/.test(posix)) return false;
	if (posix.split("/").includes("..")) return false;
	const prefixes = BASELINE_MATRIX.blackbox?.read ?? [];
	return prefixes.some((prefix) => posix.startsWith(prefix));
}

/**
 * 引号外的 shell 元字符（BUG-0082）：命令组合（; && || | & 换行）、命令替换（$( `）、
 * 重定向（> <）。引号内的元字符是字面量（URL 查询串的 & 是合法形态），不计。
 */
const BLACKBOX_SHELL_METACHARS = /[;|&<>`]/;
const BLACKBOX_SHELL_SUBSTITUTION = "$(";

/**
 * 引号感知的元字符扫描：返回首个越界的元字符描述，无越界返回 null。
 *
 * 两种引号语义不同（bash 与 PowerShell 一致）：
 * - 单引号内是真字面量——一切字符不计（含 ` 与 $( ）；
 * - 双引号内 ` 与 $( 仍是命令替换（BUG-0082 残余 A）——必须照常拦截，其余字符当字面量；
 * - 引号外 `\` 紧跟引号字符是转义的字面引号——**不开启引号区**（残余 B），否则
 *   `\" && evil \"` 会让整个命令段被误认为引号内而跳过扫描。
 * 未闭合引号返回 "unclosed-quote"（fail-safe——引号状态不明时无法保证后续元字符语义）。
 */
function blackboxShellMetachar(command: string): string | null {
	let quote: '"' | "'" | null = null;
	for (let i = 0; i < command.length; i += 1) {
		const ch = command[i];
		if (quote === "'") {
			// 单引号：唯一特殊字符是闭引号自身（bash 不认 \' 转义，PowerShell 同）
			if (ch === "'") quote = null;
			continue;
		}
		if (quote === '"') {
			// 双引号：$( 与反引号是命令替换（非字面量），必须拦；闭引号结束
			if (ch === '"') {
				quote = null;
				continue;
			}
			if (BLACKBOX_SHELL_SUBSTITUTION.startsWith(ch) && command.startsWith(BLACKBOX_SHELL_SUBSTITUTION, i)) {
				return BLACKBOX_SHELL_SUBSTITUTION;
			}
			if (ch === "`") return ch;
			continue;
		}
		// 引号外：转义的字面引号不开区（bash/cmd 的 \" 与 PowerShell 传原生命令的 \" 同义）
		if (ch === "\\" && (command[i + 1] === '"' || command[i + 1] === "'")) {
			i += 1; // 跳过被转义的引号字符本身
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			continue;
		}
		if (ch === "\n") return "newline";
		if (BLACKBOX_SHELL_SUBSTITUTION.startsWith(ch) && command.startsWith(BLACKBOX_SHELL_SUBSTITUTION, i)) {
			return BLACKBOX_SHELL_SUBSTITUTION;
		}
		if (BLACKBOX_SHELL_METACHARS.test(ch)) return ch;
	}
	return quote !== null ? "unclosed-quote" : null;
}

/** blackbox shell 白名单判定（§6.2）：首 token 命中白名单且无引号外元字符。 */
function isBlackboxShellAllowed(command: string): boolean {
	const first = command.trim().split(/\s+/)[0];
	if (!first) return false;
	if (!BLACKBOX_SHELL_WHITELIST.has(first.toLowerCase())) return false;
	// BUG-0082：首 token 匹配不够——`agent-browser x && curl ...` 的第二段命令、
	// `> out` 的重定向写文件都在首 token 语义之外（重定向还绕过写域：shell 重定向
	// 不是 file-edit 调用）。引号外出现组合/替换/重定向元字符即 fail-safe 拦截。
	return blackboxShellMetachar(command) === null;
}

/**
 * blackbox 角色的 function 类窄判定（§6.2 读域过滤）：
 * - read：path 落在 docs/ac/ 前缀内放行；缺失/越域 fail-safe block；
 * - grep/glob/ls/dir_tree/find：一律 block（用例路径由任务书点名，无需目录发现）；
 * - todo/todo_read/todo_write/list_agents 等非文件路径工具不受影响（放行）；
 * - 返回 null 表示非读类工具，交回通用分支（如 browser_tab 走末尾放行）。
 */
function judgeBlackboxReadTools(call: ToolCallShape): Verdict | null {
	if (call.toolKind !== "function") return null;
	if (BLACKBOX_READABLE_HOST_NAMES.has(call.hostName)) {
		const path = readCallPath(call.input);
		if (path === null) {
			return {
				allow: false,
				reason: `ac-fence：黑测子 read 输入缺少 path 字段，围栏无法判定读域 → fail-safe 拦截。黑盒用例输入路径由任务书点名（docs/ac/**），请按任务书路径重试；确需其他路径 → ${HELP_PROTOCOL_HINT}`,
			};
		}
		if (!isWithinBlackboxReadScope(path)) {
			return {
				allow: false,
				reason: `ac-fence：黑测子读域仅限 docs/ac/（黑盒不读实现——用例输入来自上游产物与接口卡，路径由任务书点名）：${path} 越域。需要流水产物之外的信息 → ${HELP_PROTOCOL_HINT}`,
			};
		}
		return { allow: true };
	}
	if (call.hostName === "grep" || call.hostName === "glob" || call.hostName === "ls" || call.hostName === "dir_tree" || call.hostName === "find") {
		return {
			allow: false,
			reason: `ac-fence：黑测子禁用目录发现类工具（${call.hostName}）——黑盒文档小，用例路径由任务书点名直接 read；模式化探查 src 不属于黑盒职责。确有需要 → ${HELP_PROTOCOL_HINT}`,
		};
	}
	// 其余 function 类（todo/list_agents/browser_tab 等）不属读域过滤对象
	return null;
}

// ---------------------------------------------------------------------------
// 主会话 spawn 校验（§3.2 主会话规则）
// ---------------------------------------------------------------------------

/** 主控 spawn_agent 调用的契约校验（V1 派发前校验的事中强制版）。 */
export function judgeMainSpawn(input: unknown): Verdict {
	const agentType = stringField(input, "agent_type") ?? "";
	if (!SPAWN_AGENT_TYPE_WHITELIST.has(agentType)) {
		return {
			allow: false,
			reason: `ac-fence：spawn_agent 的 agent_type "${agentType}" 不在白名单 {${[...SPAWN_AGENT_TYPE_WHITELIST].join(", ")}} 内。请改用白名单内的 agent_type；确有特殊需要 → ${HELP_PROTOCOL_HINT}`,
		};
	}
	const taskName = stringField(input, "task_name") ?? "";
	const task = (typeof input === "object" && input !== null ? (input as Record<string, unknown>).task : null) ?? {};
	const scope = parseScopeInput((task as Record<string, unknown>).scope);
	if (scope.length === 0) {
		return {
			allow: false,
			reason: `ac-fence：契约 task.scope 为空——围栏判定以契约 task.scope 为准（机器可读 glob 列表，ac-pipeline §0.2）。请按任务契约 v2 补齐 scope（单行逗号分隔 glob）。`,
		};
	}
	const role = roleFromTaskName(taskName);
	const baseline = BASELINE_MATRIX[role]?.write ?? [];
	for (const pattern of scope) {
		if (DYNAMIC_ROLES.has(role)) {
			// 动态角色（developer/deployer/finalizer/assistant/unknown）：允许项目内 glob
			if (!isProjectInternalGlob(pattern)) {
				return {
					allow: false,
					reason: `ac-fence：契约 scope 条目 "${pattern}" 不是项目内路径（动态角色只允许项目内 glob，相对项目根）。请修正契约 scope → ${HELP_PROTOCOL_HINT}`,
				};
			}
			continue;
		}
		// 静态角色：scope ⊆ 基线写域（收紧可以、放宽违规）
		if (!compileScope(baseline).matches(toPosixPath(pattern))) {
			return {
				allow: false,
				reason: `ac-fence：契约 scope 条目 "${pattern}" 超出 ${role} 基线写域（${baseline.join(", ")}）——收紧可以、放宽违规（ac-pipeline §0.3 权限矩阵）。请修正契约 scope。`,
			};
		}
	}
	// git 写豁免只授给轻量 git 子代理（task_name 前缀 git_），其余 spawn 携带一律拒（防偷带）。
	// 字段位置兼容根层与 task 契约内部（P2-2 措辞歧义统一，见 readGitWriteExemption）。
	if (readGitWriteExemption(input) && !taskName.startsWith("git_")) {
		return {
			allow: false,
			reason: `ac-fence：allow_git_write 豁免只授给轻量 git 子代理（task_name 前缀 git_，主控显式授权的存档执行者）；本契约 task_name "${taskName}" 不符合。请去掉 allow_git_write 字段，或改用 git_ 前缀重派 → ${HELP_PROTOCOL_HINT}`,
		};
	}
	return { allow: true };
}

// ---------------------------------------------------------------------------
// 判定器主入口（§3.2 伪代码即规范）
// ---------------------------------------------------------------------------

/**
 * judge(contract | null, call, isMainSession)
 * isMainSession = event.subagent 为空（主控会话）。
 * 纯内存判定：Map 查询 + glob 匹配，禁止任何 await I/O（fail-open 纪律下 handler 必须快且稳）。
 */
export function judge(contract: FenceContract | null, call: ToolCallShape, isMainSession: boolean): Verdict {
	// ── 主会话（主控）规则 ──
	if (isMainSession) {
		if (isShellCall(call)) {
			const command = stringField(call.input, "command");
			if (command !== null && isGitWriteCommand(command)) {
				return {
					allow: false,
					reason: `ac-fence：主控会话不直接跑 git 写操作——环节级存档（T 档/stage 档）走轻量 git 子代理（spawn 契约带 allow_git_write: true，围栏对该契约放行 git 写命令；ac-pipeline §0.5/§0.8）。如需 git 操作 → 起轻量 git 子代理，或 ${HELP_PROTOCOL_HINT}`,
				};
			}
			return { allow: true };
		}
		if (isAgentCall(call)) {
			// spawn 白名单/契约校验（登记由 fence.ts 在放行后执行）
			return judgeMainSpawn(call.input);
		}
		return { allow: true };
	}

	// ── 子会话规则 ──
	if (contract === null) {
		// 未登记子代理：只读类放行，其余拦截
		if (call.toolKind === "function" && READONLY_HOST_NAMES.has(call.hostName)) {
			return { allow: true };
		}
		return {
			allow: false,
			reason: `ac-fence：未登记会话：写操作被围栏拦截（本子代理无任务契约登记）。${HELP_PROTOCOL_HINT}`,
		};
	}

	// explorer 型评审子机制级只读：file-edit 出现即纵深防御拦截（无论 scope）
	if (contract.agentType === "explorer" && isFileEditCall(call)) {
		return {
			allow: false,
			reason: `ac-fence：explorer 型子代理机制只读，file-edit 调用被纵深防御拦截。评审产出的落盘需求 → ${HELP_PROTOCOL_HINT}（verdict 全文带回，主控代写 reviews.md）`,
		};
	}

	if (isFileEditCall(call)) {
		const path = editPath(call.input);
		if (path === null) {
			return {
				allow: false,
				reason: `ac-fence：file-edit 输入缺少 path 字段，围栏无法判定写域 → fail-safe 拦截。如为合法操作 → ${HELP_PROTOCOL_HINT}`,
			};
		}
		const rel = toPosixPath(path);
		const domain = effectiveWriteScope(contract);
		if (domain.matches(rel)) return { allow: true };
		return {
			allow: false,
			reason: `ac-fence：越权写：${rel} 不在任务契约 scope 内（契约 scope: ${contract.scope.join(", ") || "(空)"}；角色 ${contract.role} 基线 ${BASELINE_MATRIX[contract.role]?.write.join(", ") || "(动态)"}）。需要扩展写域 → ${HELP_PROTOCOL_HINT}`,
		};
	}

	if (isShellCall(call)) {
		const command = stringField(call.input, "command");
		if (command === null) {
			return {
				allow: false,
				reason: `ac-fence：shell 输入缺少 command 字段，围栏无法判定 → fail-safe 拦截。如为合法操作 → ${HELP_PROTOCOL_HINT}`,
			};
		}
		// blackbox 角色：shell 只放行通道白名单（agent-browser 前缀），其余含 git 只读一律拦——黑测子不需要 git
		if (contract.role === "blackbox") {
			if (isBlackboxShellAllowed(command)) return { allow: true };
			const metachar = blackboxShellMetachar(command);
			const first = command.trim().split(/\s+/)[0] ?? "";
			const whitelisted = BLACKBOX_SHELL_WHITELIST.has(first.toLowerCase());
			const hint = whitelisted
				? `命令含引号外元字符（${metachar ?? "?"}）——复合命令请拆分为单条执行（每条独立过围栏），重定向写文件不在黑测子权限内；确需其他命令 → ${HELP_PROTOCOL_HINT}`
				: `黑测子 shell 仅放行自测通道命令（白名单：${[...BLACKBOX_SHELL_WHITELIST].join(", ")} 前缀）。服务起停与环境探测属辅助者（helper）职责；确需其他命令 → ${HELP_PROTOCOL_HINT}`;
			return {
				allow: false,
				reason: `ac-fence：${hint}（被拦截命令：${command.slice(0, 80)}）`,
			};
		}
		if (isGitWriteCommand(command)) {
			// 豁免通道：主控显式授权的轻量 git 子代理（存档执行者，契约 allow_git_write: true）
			if (contract.gitWriteAllow === true) return { allow: true };
			return {
				allow: false,
				reason: `ac-fence：git 写操作被围栏拦截：提交历史是流水线审计日志，打点权在主控侧（环节级存档制，ac-pipeline §0.5）。存档（T 档/stage 档）由主控起轻量 git 子代理执行（契约 allow_git_write: true）；如确需 git 操作 → ${HELP_PROTOCOL_HINT}`,
			};
		}
		return { allow: true };
	}

	if (isAgentCall(call)) {
		return {
			allow: false,
			reason: `ac-fence：子代理不可再 spawn（内核已禁用 spawn 工具，此处纵深防御）。确有需要 → ${HELP_PROTOCOL_HINT}`,
		};
	}

	// blackbox 角色：读类 function 工具做窄读域判定（read 前缀过滤 + 目录发现类全拦）。
	// 非 读类 function（browser_tab 通道、todo 等）返回 null 落到末尾通用放行。
	if (contract.role === "blackbox") {
		const verdict = judgeBlackboxReadTools(call);
		if (verdict !== null) return verdict;
	}

	// 其他（function/mcp/custom）→ 放行：读类工具不拦；MCP 工具越权由 L1.5 审计兜底（§3.4 观察期）
	return { allow: true };
}
