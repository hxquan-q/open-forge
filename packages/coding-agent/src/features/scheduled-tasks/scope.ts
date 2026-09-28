// Copyright The Open Forge contributors.
/**
 * 会话项目作用域的判定：任务归属哪个项目由任务 `cwd` 决定，与会话绑定的项目根
 * 做归一化比较。判不上的宁可 NOT_FOUND，也不能把别的项目的任务放进本作用域。
 */

/**
 * 把目录路径归一成可比较的作用域键：统一分隔符、去尾部斜杠；
 * Windows 形状（盘符/UNC）的路径按该平台语义大小写不敏感，
 * `ssh://` 与 POSIX 路径保持大小写精确。
 */
export function scheduledTaskScopeKey(path: string): string {
	let normalized = path.trim().replace(/\\/g, "/");
	while (normalized.length > 1 && normalized.endsWith("/")) {
		normalized = normalized.slice(0, -1);
	}
	if (/^[a-zA-Z]:\//.test(normalized) || normalized.startsWith("//")) {
		normalized = normalized.toLowerCase();
	}
	return normalized;
}

export function isScheduledTaskInScope(taskCwd: string, projectScopeKey: string): boolean {
	return scheduledTaskScopeKey(taskCwd) === projectScopeKey;
}
