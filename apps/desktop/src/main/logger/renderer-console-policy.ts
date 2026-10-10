// Copyright The Open Forge contributors.
export type RendererConsoleLevel = "log" | "info" | "warn" | "error";

const LOW_SIGNAL_PREFIXES = ["[plugin-agent]", "[activity-tab-debug]", "[vite-hmr]", "[skills] loaded"] as const;
const RESIZE_OBSERVER_DELIVERY_WARNING = "ResizeObserver loop completed with undelivered notifications.";
const FLUSH_SYNC_LIFECYCLE_WARNING =
	"flushSync was called from inside a lifecycle method. React cannot flush when React is already rendering. Consider moving this call to a scheduler task or micro task.";

/**
 * Chromium 在分屏/窗口连续 resize 时会把延迟投递的 ResizeObserver 回调以内部 console
 * error 上报。消息文本本身足够特异；行号恒为 0，可区分真实业务 throw（行号非 0）。
 * 不校验 sourceId：packaged 下为空串，dev 下 Chromium 会填页面 URL（BUG-0048）。
 */
export function isChromiumResizeObserverDiagnostic(message: string, line: number): boolean {
	return line === 0 && message === RESIZE_OBSERVER_DELIVERY_WARNING;
}

/**
 * React DEV 构建在 `flushSync` 于 render/commit 期被执行时打印的调用时机诊断（BUG-0083）。
 *
 * 出现这条消息说明某个**依赖自带的** `flushSync` 在提交期跑（本仓第一方已无调用点，见
 * `useSidebarSelectionIntent`）；生产构建没有这条检查，功能不受影响，但 90 秒窗口能落盘
 * 45 条，把真实 renderer 错误淹没。文案完整且唯一，精确匹配即可；不做前缀匹配，避免吞掉
 * 真实业务错误。DevTools 控制台不会被过滤，需要时仍可现场看到。
 */
export function isReactFlushSyncLifecycleDiagnostic(message: string): boolean {
	return message === FLUSH_SYNC_LIFECYCLE_WARNING;
}

/**
 * Renderer 的 console 是不可信的混合入口：既有用户操作错误，也有 HMR/插件调试输出。
 * 默认只把低信号的开发诊断挡在持久化日志之外；warn/error 始终保留。
 */
export function shouldPersistRendererConsoleMessage(
	level: RendererConsoleLevel,
	message: string,
	verbose = process.env.VETTA_RENDERER_VERBOSE_LOGS === "1",
): boolean {
	if (verbose || level === "warn" || level === "error") return true;
	if (LOW_SIGNAL_PREFIXES.some((prefix) => message.startsWith(prefix))) return false;
	if (/^\[vite\] (connecting\.\.\.|connected\.|hot updated:|invalidate )/u.test(message)) return false;
	if (/^\[theme-runtime\] (?:module |loadThemePackage |styles? |themes\.list |remote |loadRemote )/u.test(message)) {
		return false;
	}
	return true;
}
