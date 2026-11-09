// Copyright The Open Forge contributors.
import { basename } from "node:path";
import type { SessionEvent } from "@vetta/runtime-core";
import { readConfigSync } from "../config/desktop-config-store.js";
import { type DebugRequestData, writeDebugRequest } from "../debug-writer.js";

/**
 * Debug 请求记录（TASK-0477 从 ipc/session.ts 抽出）：旧 IPC 订阅与 Host
 * session.subscribe 域共用同一份状态，避免事件经哪条路径订阅就丢记录或重复记录。
 * cwd 由会话创建方镜像进来——`sessionCwdMap` 本身还服务会话恢复等路径，留在原处。
 */

const sessionCwdMap = new Map<string, string>();
const debugSeqMap = new Map<string, number>();
const turnStartMap = new Map<string, number>();

/** 会话创建后镜像 cwd，debug 记录据此定位项目目录。 */
export function rememberSessionDebugCwd(sessionId: string, cwd: string): void {
	sessionCwdMap.set(sessionId, cwd);
}

/** 会话销毁/切换时清空该会话的 debug 状态。 */
export function forgetSessionDebugState(sessionId: string): void {
	sessionCwdMap.delete(sessionId);
	debugSeqMap.delete(sessionId);
	turnStartMap.delete(sessionId);
}

/** 订阅回调里逐事件调用；记录失败不得打断事件管线。 */
export function recordSessionEventForDebug(sessionId: string, runtimeEvent: SessionEvent): void {
	try {
		if (runtimeEvent.type === "session.lifecycle" && runtimeEvent.phase === "turn_start") {
			turnStartMap.set(sessionId, Date.now());
		}
		const assistantMessage =
			runtimeEvent.channel === "assistant" && runtimeEvent.type === "done"
				? runtimeEvent.message
				: runtimeEvent.channel === "assistant" && runtimeEvent.type === "error"
					? runtimeEvent.error
					: undefined;
		if (assistantMessage && readConfigSync().debugMode) {
			const cwd = sessionCwdMap.get(sessionId);
			if (cwd) {
				const projectName = basename(cwd);
				const seq = (debugSeqMap.get(sessionId) ?? 0) + 1;
				debugSeqMap.set(sessionId, seq);
				const msg = assistantMessage as unknown as Record<string, unknown>;
				const usage = (msg.usage ?? {}) as DebugRequestData["usage"];
				const turnStart = turnStartMap.get(sessionId) ?? Date.now();
				const now = Date.now();
				const data: DebugRequestData = {
					timestamp: now,
					sessionId,
					model: (msg.model as string) ?? "unknown",
					provider: (msg.provider as string) ?? "unknown",
					api: (msg.api as string) ?? "unknown",
					usage,
					stopReason: (msg.stopReason as string) ?? "unknown",
					durationMs: now - turnStart,
					message: msg,
				};
				void writeDebugRequest(projectName, sessionId, data, seq);
			}
		}
	} catch {
		// Debug recording should never break the event pipeline
	}
}
