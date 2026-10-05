// Modified by The Open Forge contributors.
/**
 * `CONFIG_SET` 必须保留它不认识的配置字段。
 *
 * 这个处理器只能按字段白名单应用补丁，同时必须从中央事务入口提供的最新 DesktopConfig
 * 开始更新。`sshHosts` 与 `remoteControl` 曾因旧的整文件写回路径被漏掉；这个合同测试防止
 * IPC 再引入旁路写入或用字段白名单重建整份配置。
 *
 * 处理器接线在 `registerFsIpc` 内部，拿不到可注入的边界，故以源码断言守住这条结构约束
 * （与 agent-mode-ipc.test.ts 同一理由）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "../../shared/notification-preferences.js";
import { DESKTOP_CONFIG_SCHEMA_VERSION } from "../config/desktop/migrate-config.js";
import { mergeDesktopConfigPatch } from "../config/desktop-config-patch.js";
import type { DesktopConfig } from "../config/desktop-config-store.js";

function readConfigSetHandler(): string {
	const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fs.ts"), "utf8");
	const start = source.indexOf("ipcMain.handle(CHANNELS.CONFIG_SET");
	expect(start).toBeGreaterThan(0);
	const end = source.indexOf("ipcMain.handle(", start + 1);
	expect(end).toBeGreaterThan(start);
	return source.slice(start, end);
}

it("applies the domain patch to the current transaction snapshot without a write bypass", () => {
	const handler = readConfigSetHandler();
	expect(handler).toMatch(/updateDesktopConfig\(\(current\) => \{/);
	expect(handler).toContain("mergeDesktopConfigPatch(current, patch)");
	expect(handler).not.toMatch(/writeDesktopConfig\(/);
	const current: DesktopConfig = {
		schemaVersion: DESKTOP_CONFIG_SCHEMA_VERSION,
		notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
		projects: [],
		archivedProjects: [],
		workspacePath: "/fixture",
		defaultExecutionMode: "sandbox",
		notificationsEnabled: true,
		remoteControl: { pairingId: "fixture" },
		sshHosts: [{ id: "fixture", label: "fixture", target: "fixture", source: "manual" }],
	};
	const snapshot = { ...current, futureField: { enabled: true } };
	expect(mergeDesktopConfigPatch(snapshot, { notificationsEnabled: false })).toMatchObject({
		...snapshot,
		notificationsEnabled: false,
	});
	expect(snapshot.notificationsEnabled).toBe(true);
});
