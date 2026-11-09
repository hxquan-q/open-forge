// Modified by The Open Forge contributors.
/**
 * 改「新会话默认工作模式」只允许写配置 + 广播显示同步。
 *
 * 模式已不再排除任何插件贡献，所以按模式重建插件运行配置、或让 renderer 重载插件 bundle，
 * 都只是把一份完全相同的配置推给正在跑的会话，白白抖动活跃会话的插件运行时。
 * 该入口已迁到 Host 合同 session.setGlobalAgentMode（TASK-0472），实现在
 * host/session-execution-domain.ts 且拿不到可注入的边界，故以源码断言守住这条结构约束。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

function readGlobalAgentModeHandler(): string {
	const source = readFileSync(
		join(dirname(fileURLToPath(import.meta.url)), "../host/session-execution-domain.ts"),
		"utf8",
	);
	const start = source.indexOf("setGlobalAgentMode:");
	expect(start).toBeGreaterThan(0);
	// 广播辅助函数在文件尾部，取 handler 起点到文件末尾（文件只含本领域实现）。
	return source.slice(start);
}

it("persists the default mode and broadcasts it for toggle display sync", () => {
	const handler = readGlobalAgentModeHandler();

	expect(handler).toContain("updateDesktopConfig((settings) => ({ ...settings, defaultAgentMode: next }))");
	expect(handler).toContain("agent-mode-changed");
});

it("never rebuilds plugin runtime config or reloads renderer plugins", () => {
	const handler = readGlobalAgentModeHandler();

	expect(handler).not.toMatch(/reconfigureAgentPlugins/);
	expect(handler).not.toMatch(/broadcastPluginsChanged/);
	expect(handler).not.toMatch(/setAgentMode/);
});
