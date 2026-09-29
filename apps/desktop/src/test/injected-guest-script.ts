// Copyright The Open Forge contributors.

/**
 * 在测试里整段求值注入 guest 的脚本（`buildInAppBrowserGuestScript` /
 * `buildBrowserTabGuestScript` 的产物）。
 *
 * 生产路径是 `webContents.executeJavaScript`：脚本在 guest 的全局作用域里执行。
 * 间接 eval 复现同样的标识符解析，才能暴露「脚本引用了 guest 里不存在的绑定」
 * 这类只有整段求值才看得见的缺陷（BUG-0051）。
 */
export function evaluateInjectedGuestScript(script: string): unknown {
	// biome-ignore lint/security/noGlobalEval: 注入脚本必须以全局作用域整段求值才等价于 executeJavaScript
	const indirectEval = eval;
	return indirectEval(script);
}
