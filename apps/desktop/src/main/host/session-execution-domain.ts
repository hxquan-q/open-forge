// Copyright The Open Forge contributors.

import type { HostDomainImplementation, SESSION_EXECUTION_HOST_METHODS } from "@vetta/host-protocol";
import type { SessionExecutionMode } from "@vetta/runtime-core";
import { assertProjectSupportsExecutionMode } from "@vetta/runtime-desktop";
import { BrowserWindow } from "electron";
import { DEFAULT_AGENT_MODE, isAgentMode, MODE_PROMPTS } from "../agent-modes/index.js";
import { updateAgentSettingsDocument } from "../agent-settings/settings-document-store.js";
import { readDesktopConfig, updateDesktopConfig } from "../config/desktop-config-store.js";
import { readSessionCwdFromHeader } from "../conversations/session-paths.js";
import { getSharedRuntime } from "../runtime.js";
import { assertSandboxAvailableForMode } from "../sandbox/capability.js";

/**
 * 会话执行模式与全局设置子域的 Host 实现（TASK-0472）：与旧 IPC handler 同职责。
 * setExecutionMode 的编排（cwd 支持断言 + sandbox 可用断言）与全局设置的
 * 落盘语义随迁移保留；AGENT_MODE_CHANGED 显示同步广播仍走旧 IPC 事件。
 */
export const sessionExecutionHostDomain: HostDomainImplementation<typeof SESSION_EXECUTION_HOST_METHODS> = {
	updateSettings: async ({ sessionId, patch }) => {
		await getSharedRuntime().updateSettings(sessionId, patch);
		return null;
	},
	setExecutionMode: async ({ sessionId, mode }) => {
		const runtime = getSharedRuntime();
		const sessionPath = runtime.getSessionPath(sessionId);
		const sessionCwd = sessionPath ? await readSessionCwdFromHeader(sessionPath) : undefined;
		assertProjectSupportsExecutionMode(sessionCwd, mode);
		await assertSandboxAvailableForMode(mode, resolveDefaultExecutionMode);
		await runtime.setExecutionMode(sessionId, mode);
		return null;
	},
	setGlobalExecutionMode: async ({ mode }) => {
		await assertSandboxAvailableForMode(mode, resolveDefaultExecutionMode);
		await updateDesktopConfig((settings) => ({ ...settings, defaultExecutionMode: mode }));
		return null;
	},
	setGlobalAgentMode: async ({ mode }) => {
		const next = isAgentMode(mode) ? mode : DEFAULT_AGENT_MODE;
		await updateDesktopConfig((settings) => ({ ...settings, defaultAgentMode: next }));
		broadcastAgentModeChanged(next);
		return null;
	},
	setGlobalThinkingLevel: ({ level }) => {
		getSharedRuntime().updateGlobalThinkingLevel(level);
		updateAgentSettingsDocument((settings) => {
			settings.defaultThinkingLevel = level;
		});
		return Promise.resolve(null);
	},
	getAgentModes: () =>
		Promise.resolve(
			MODE_PROMPTS.map((m) => ({ id: m.id, label: m.label, description: m.description, icon: m.icon })),
		),
};

const resolveDefaultExecutionMode = async (): Promise<SessionExecutionMode> => {
	const config = await readDesktopConfig();
	return config.defaultExecutionMode;
};

function broadcastAgentModeChanged(mode: string): void {
	// 仅用于各窗口新会话页 toggle 的显示同步（事件面仍在旧 IPC，事件原语另片统一）。
	for (const win of BrowserWindow.getAllWindows()) {
		win.webContents.send("vetta:session:agent-mode-changed", mode);
	}
}
