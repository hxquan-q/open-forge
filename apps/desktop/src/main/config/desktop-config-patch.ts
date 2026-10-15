// Copyright The Open Forge contributors.

import { normalizeNotificationPreferences } from "../../shared/notification-preferences.js";
import { mergeProxyConfigPatch } from "../proxy/proxy-settings.js";
import type { DesktopConfig } from "./desktop-config-store.js";
import {
	normalizeAgentMode,
	normalizeAppshot,
	normalizeExecutionMode,
	normalizeExperimental,
	normalizeImageGeneration,
	normalizeKnowledgeBase,
	normalizeQuickPanel,
	normalizeShortcuts,
} from "./desktop-config-store.js";

export type DesktopConfigPatch = Partial<Omit<DesktopConfig, "proxy">> & { proxy?: unknown };

/** Preserve omitted fields and the existing per-field patch/reset semantics. */
export function mergeDesktopConfigPatch(current: DesktopConfig, patch: DesktopConfigPatch): DesktopConfig {
	return {
		// 先摊开 current 打底。下面是一张字段白名单，而配置的旧写入口是整文件覆盖：
		// 白名单漏掉哪个字段，哪个字段就会在用户每次保存设置时被从磁盘上抹掉。sshHosts
		// 和 remoteControl 就是这么丢的——它们晚于这个处理器加入 DesktopConfig，而两者
		// 都是可选字段，TypeScript 不会提示缺失。打底之后白名单只决定「哪些字段允许被
		// 补丁改写」，不再决定「哪些字段能活下来」。
		...current,
		projects: patch.projects ?? current.projects,
		archivedProjects: patch.archivedProjects ?? current.archivedProjects,
		workspacePath: patch.workspacePath ?? current.workspacePath,
		defaultExecutionMode:
			patch.defaultExecutionMode !== undefined
				? normalizeExecutionMode(patch.defaultExecutionMode)
				: current.defaultExecutionMode,
		defaultAgentMode:
			patch.defaultAgentMode !== undefined ? normalizeAgentMode(patch.defaultAgentMode) : current.defaultAgentMode,
		debugMode: patch.debugMode ?? current.debugMode,
		vettaAppPath: patch.vettaAppPath ?? current.vettaAppPath,
		vettaCliAppPath: patch.vettaCliAppPath ?? current.vettaCliAppPath,
		notificationsEnabled: patch.notificationsEnabled ?? current.notificationsEnabled,
		notificationPreferences:
			patch.notificationPreferences !== undefined
				? normalizeNotificationPreferences({
						...current.notificationPreferences,
						...patch.notificationPreferences,
						events: {
							...current.notificationPreferences.events,
							...patch.notificationPreferences.events,
						},
					})
				: current.notificationPreferences,
		language: patch.language ?? current.language,
		experimental:
			patch.experimental !== undefined
				? normalizeExperimental({ ...current.experimental, ...patch.experimental })
				: current.experimental,
		imageGeneration:
			patch.imageGeneration !== undefined
				? normalizeImageGeneration({ ...current.imageGeneration, ...patch.imageGeneration })
				: current.imageGeneration,
		knowledgeBase:
			patch.knowledgeBase !== undefined
				? normalizeKnowledgeBase({ ...current.knowledgeBase, ...patch.knowledgeBase })
				: current.knowledgeBase,
		// bindings 整表替换（支持 reset 删键）；GUI/Action 均传完整 map。
		shortcuts: patch.shortcuts !== undefined ? normalizeShortcuts(patch.shortcuts) : current.shortcuts,
		quickPanel:
			patch.quickPanel !== undefined
				? normalizeQuickPanel({ ...current.quickPanel, ...patch.quickPanel })
				: current.quickPanel,
		appshot:
			patch.appshot !== undefined ? normalizeAppshot({ ...current.appshot, ...patch.appshot }) : current.appshot,
		// 补丁省略 password 即沿用已存口令，渲染层不必回传明文。
		proxy: patch.proxy !== undefined ? mergeProxyConfigPatch(current.proxy, patch.proxy) : current.proxy,
	};
}
