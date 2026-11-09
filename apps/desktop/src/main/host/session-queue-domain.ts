// Copyright The Open Forge contributors.
import type { HostDomainImplementation, SESSION_QUEUE_HOST_METHODS } from "@vetta/host-protocol";
import { getSharedRuntime } from "../runtime.js";

/**
 * 会话输入队列子域的 Host 实现（TASK-0467）：薄桥接，能力全部在 RuntimeHost
 * （与旧 IPC handler 同职责，只换合同入口；ADR-0060）。
 */
export const sessionQueueHostDomain: HostDomainImplementation<typeof SESSION_QUEUE_HOST_METHODS> = {
	getQueueState: ({ sessionId }) => {
		const state = getSharedRuntime().getQueueState(sessionId);
		return Promise.resolve({
			paused: state.paused,
			entries: state.entries.map((entry) => ({ ...entry })),
		});
	},
	queueContextCompaction: ({ sessionId }) => getSharedRuntime().queueSessionContextCompaction(sessionId),
	removeQueuedMessage: ({ sessionId, itemId }) => getSharedRuntime().removeQueuedMessage(sessionId, itemId),
	reorderQueuedMessages: async ({ sessionId, itemIds }) => {
		getSharedRuntime().reorderQueuedMessages(sessionId, [...itemIds]);
		return null;
	},
	sendQueuedMessageNow: ({ sessionId, itemId }) => getSharedRuntime().sendQueuedMessageNow(sessionId, itemId),
	resumeQueue: async ({ sessionId }) => {
		await getSharedRuntime().resumeQueue(sessionId);
		return null;
	},
	clearQueue: async ({ sessionId }) => {
		getSharedRuntime().clearQueue(sessionId);
		return null;
	},
};
