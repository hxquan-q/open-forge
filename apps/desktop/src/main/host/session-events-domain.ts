// Copyright The Open Forge contributors.
import { randomUUID } from "node:crypto";
import {
	CODING_AGENT_BACKGROUND_TASKS_OBSERVATION,
	CODING_AGENT_BACKGROUND_TASKS_READ,
	CODING_AGENT_SUBAGENTS_OBSERVATION,
	CODING_AGENT_SUBAGENTS_READ,
} from "@vetta/coding-agent/session-extensions";
import {
	HOST_PROTOCOL_ERROR_CODES,
	type HostDomainImplementation,
	type HostEventSink,
	HostProtocolError,
	type SESSION_EVENTS_HOST_METHODS,
} from "@vetta/host-protocol";
import type { SessionEvent } from "@vetta/runtime-core";
import { sessionExtensionObservation } from "@vetta/runtime-core/session-extensions";
import { recordSessionEventForDebug } from "../conversations/session-debug-recorder.js";
import { slimSessionEventForIpc } from "../conversations/slim-session-event-for-ipc.js";
import { getSharedRuntime } from "../runtime.js";

/**
 * 会话事件子域的 Host 实现（TASK-0477）：订阅挂在发起请求的连接上，事件经
 * `ctx.events` 下发；端口关闭时摘除该连接的全部 runtime 订阅。三份快照回放与旧
 * IPC handler 同序同形——后台任务、激活工具、subagent——renderer 刷新期间不丢状态。
 * invoke 回退通道没有事件面（`ctx.events` 缺省），此时拒绝订阅由 preload 回退旧通道。
 */

type ConnectionSubscriptions = Map<string, () => void>;

const connections = new WeakMap<HostEventSink, ConnectionSubscriptions>();

function subscriptionsFor(sink: HostEventSink): ConnectionSubscriptions {
	const existing = connections.get(sink);
	if (existing) return existing;
	const subscriptions: ConnectionSubscriptions = new Map();
	connections.set(sink, subscriptions);
	// 端口关闭：摘除该连接上的全部 runtime 订阅，避免关闭后继续收事件。
	sink.onClose(() => {
		for (const unsubscribe of subscriptions.values()) unsubscribe();
		subscriptions.clear();
	});
	return subscriptions;
}

export const sessionEventsHostDomain: HostDomainImplementation<typeof SESSION_EVENTS_HOST_METHODS> = {
	subscribe: async ({ sessionId }, ctx) => {
		const events = ctx.events;
		if (!events) {
			throw new HostProtocolError(
				HOST_PROTOCOL_ERROR_CODES.CAPABILITY_UNAVAILABLE,
				"session.subscribe requires a host event channel",
			);
		}
		const runtime = getSharedRuntime();
		const subscriptionId = `${sessionId}:${randomUUID()}`;
		const unsubscribe = runtime.subscribe(sessionId, (runtimeEvent: SessionEvent) => {
			recordSessionEventForDebug(sessionId, runtimeEvent);
			events.emitEvent(subscriptionId, slimSessionEventForIpc(runtimeEvent));
		});
		subscriptionsFor(events).set(subscriptionId, unsubscribe);

		// 回放后台任务快照：注册表在主进程内存中跨 renderer 重载存活，但
		// 后台任务扩展观察只在状态变化时推送——renderer 刷新后 atom
		// 清空，若不回放，无输出的运行中任务（如 sleep）要等到结束才再现。
		const backgroundTasks = await runtime.invokeSessionExtension(
			sessionId,
			CODING_AGENT_BACKGROUND_TASKS_READ,
			undefined,
		);
		if (backgroundTasks.length > 0) {
			events.emitEvent(subscriptionId, {
				schemaVersion: 1,
				channel: "runtime",
				sessionId,
				eventId: randomUUID(),
				timestamp: Date.now(),
				source: "extension",
				...sessionExtensionObservation(CODING_AGENT_BACKGROUND_TASKS_OBSERVATION, backgroundTasks),
			});
		}

		// 回放激活工具集：renderer 的 getState 快照取于 subscribe 之前，插件若恰好在这两步
		// 之间才 activate，那次 active_tools_update 就没人接。补一次当前快照堵住这个窗口。
		try {
			events.emitEvent(subscriptionId, {
				schemaVersion: 1,
				channel: "runtime",
				sessionId,
				eventId: randomUUID(),
				timestamp: Date.now(),
				source: "runtime-core",
				type: "active_tools_update",
				activeToolNames: runtime.getState(sessionId).activeToolNames,
			});
		} catch {
			// session 可能已被销毁，回放失败不影响订阅本身。
		}

		const subagents = await runtime.invokeSessionExtension(sessionId, CODING_AGENT_SUBAGENTS_READ, undefined);
		if (subagents.length > 0) {
			events.emitEvent(subscriptionId, {
				schemaVersion: 1,
				channel: "runtime",
				sessionId,
				eventId: randomUUID(),
				timestamp: Date.now(),
				source: "extension",
				...sessionExtensionObservation(CODING_AGENT_SUBAGENTS_OBSERVATION, subagents),
			});
		}

		return { subscriptionId };
	},
	unsubscribe: ({ subscriptionId }, ctx) => {
		const events = ctx.events;
		const subscriptions = events ? connections.get(events) : undefined;
		const unsubscribe = subscriptions?.get(subscriptionId);
		if (unsubscribe) {
			subscriptions?.delete(subscriptionId);
			unsubscribe();
		}
		return null;
	},
};
