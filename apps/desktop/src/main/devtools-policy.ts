// 生产环境 DevTools 门禁的唯一事实源。
//
// 打包版把 DevTools 入口暴露给终端用户会形成 self-XSS 面：renderer 虽然开了
// contextIsolation，但控制台里能直接调用 preload 暴露的全部 IPC、读取本地会话与
// 凭据，社工「把这段代码粘到控制台」即可完成账号劫持。故打包版默认关闭所有
// DevTools 入口（应用菜单、桌宠右键菜单），只保留 VETTA_DEVTOOLS=1 环境变量作为
// 线上排障逃生口——需要用户主动从命令行带环境变量启动，正常使用路径拿不到。
import { app } from "electron";

export const DEVTOOLS_ENV_FLAG = "VETTA_DEVTOOLS";

export function isDevToolsAllowed(): boolean {
	return !app.isPackaged || process.env[DEVTOOLS_ENV_FLAG] === "1";
}

// 开发运行默认在主窗口加载后自动打开 DevTools。DevTools 打开期间会持有页面创建过的
// 全部 CSS/Web 动画及其目标元素（含已卸载的），流式长会话里可达数千个，渲染进程内存
// 随之膨胀，也会让 heap snapshot 误报游离 DOM。VETTA_DEV_AUTO_DEVTOOLS=0 只关掉自动
// 打开，菜单 / 快捷键仍可手动打开。
export const DEV_AUTO_DEVTOOLS_ENV_FLAG = "VETTA_DEV_AUTO_DEVTOOLS";

export function shouldAutoOpenDevTools(input: {
	readonly isPackaged: boolean;
	readonly env: Readonly<Record<string, string | undefined>>;
}): boolean {
	if (input.isPackaged) return false;
	// E2E: extra windows would steal WebdriverIO focus.
	if (input.env.VETTA_E2E === "1") return false;
	return input.env[DEV_AUTO_DEVTOOLS_ENV_FLAG] !== "0";
}
