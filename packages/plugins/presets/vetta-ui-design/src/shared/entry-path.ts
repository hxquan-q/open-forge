// Copyright The Open Forge contributors.

/**
 * zip 条目名 → 安全相对路径的判定（TASK-0309）。
 *
 * 分享包（.vetdz）与 history.zip 的条目名来自外部文件，是不可信输入：`../` 段、
 * 绝对路径、盘符或反斜杠都可能在落盘时写出目标目录之外（路径穿越）。宿主对本地
 * 项目路径有兜底断言，但 SSH 远程写不走它，history runner 更是裸 node fs——所以
 * 把 zip 条目写到磁盘的每条路径都必须先过这里。
 *
 * 命中不安全条目时整包拒绝，不做逐条跳过：半解开的包比失败的导入更难收场。
 */

const WINDOWS_DRIVE = /^[A-Za-z]:/;

/** 条目是否是一个只会在目标目录内部展开的相对路径。目录条目（尾随 `/`）由调用方先剥掉。 */
export function isSafeEntryPath(entry: string): boolean {
	if (entry.length === 0 || entry === "." || entry === "..") return false;
	// zip 条目名以 `/` 为分隔符；反斜杠只可能来自攻击或坏打包器，一律拒绝。
	if (entry.includes("\\")) return false;
	if (entry.startsWith("/") || WINDOWS_DRIVE.test(entry)) return false;
	if (entry.includes("\0")) return false;
	// 空段（`a//b`）与 `.`/`..` 段都拒绝：自家导出的包不会产生这两种形态。
	return entry.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

/** 同 {@link isSafeEntryPath} 的断言版，不安全时抛带条目名的错误，`what` 用于报错文案。 */
export function assertSafeEntryPath(entry: string, what: string): void {
	if (!isSafeEntryPath(entry)) {
		throw new Error(`${what} contains an unsafe entry path: ${JSON.stringify(entry)}`);
	}
}
