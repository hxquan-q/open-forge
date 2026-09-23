import type { ToolRiskLevel } from "@vetta/runtime-core/task";

/**
 * Shell/Git 的参数级风险提升（TASK-0019）。
 *
 * 默认矩阵给 bash/shell 定 L3（逐次审批，可被项目信任覆盖）；这里按命令内容
 * 把不可逆/破坏性操作提升到 L4——L4 任何信任都盖不掉，永远逐次确认。
 * 等级只升不降：只读类 git 命令保持 L3 默认，不做下调。
 */

const DESTRUCTIVE_PATTERNS: readonly RegExp[] = [
	/\bgit\s+push[^|;&]*\s--force(-with-lease)?\b/i,
	/\bgit\s+reset\s+--hard/i,
	/\bgit\s+clean\s+(-[a-z]*f|[a-z-]*--force)/i,
	/\bgit\s+checkout\s+--\s/i,
	/\bgit\s+branch\s+(-D|--delete\s+--force)/i,
	/\bgit\s+reflog\s+expire/i,
	/\bgit\s+filter-branch/i,
	/\bgit\s+submodule\s+deinit/i,
	/\brm\s+(-[a-z]*r[a-z]*f[a-z]*|-[a-z]*f[a-z]*r[a-z]*)/i,
	/\bmkfs(\.|$)/i,
	/\bdd\s+.*of=\/dev\//i,
	/\bchmod\s+-R\s+0*777\b/i,
	/\bcurl\s+[^|;]*\|\s*(ba)?sh/i,
	/\bshutdown\b|\breboot\b/i,
];

/** 判断一次 shell 调用是否应提升到 L4；输入为脱敏前的原始参数（仅本地判定）。 */
export function raiseShellRiskLevel(input: Readonly<Record<string, unknown>>): ToolRiskLevel | undefined {
	const command = typeof input.command === "string" ? input.command : "";
	if (command.length === 0) return undefined;
	for (const pattern of DESTRUCTIVE_PATTERNS) {
		if (pattern.test(command)) return "L4";
	}
	return undefined;
}
