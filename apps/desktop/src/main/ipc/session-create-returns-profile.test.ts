// Modified by The Open Forge contributors.
/**
 * CHANNELS.CREATE 的返回是渲染端 activeSessionAtom 的档位事实源：service 已算出
 * agentMode/capabilityProfile，handler 若不透传，渲染端永远拿不到档位——BUG-0161
 * 中 §11.3 热追踪门控因此把交互式 code 会话全部误拦（终端投屏空白）。处理器接线
 * 在 registerSessionIpc 内部、无可注入边界，沿用 agent-mode-ipc.test 的源码断言先例。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

function readCreateHandler(): string {
	const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "session.ts"), "utf8");
	const start = source.indexOf("ipcMain.handle(\n\t\tCHANNELS.CREATE");
	expect(start).toBeGreaterThan(0);
	const end = source.indexOf("ipcMain.handle(", start + 1);
	expect(end).toBeGreaterThan(start);
	return source.slice(start, end);
}

it("透传 service 已固化的会话档位，供渲染端 activeSession 与热追踪门控消费", () => {
	const handler = readCreateHandler();
	expect(handler).toContain("agentMode: result.agentMode");
	expect(handler).toContain("capabilityProfile: result.capabilityProfile");
});
