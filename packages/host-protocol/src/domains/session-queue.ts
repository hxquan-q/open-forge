// Copyright The Open Forge contributors.
import { Type } from "@sinclair/typebox";
import { defineHostMethod, type HostMethodSignatures } from "../method.js";

/**
 * 会话输入队列子域合同（PLAN-0029 Phase 3 领域迁移，TASK-0467；ADR-0060 队列能力）。
 * 纯请求/响应：队列态由 `session.getQueueState` 拉取，没有独立的推送通道。
 */

const SessionIdParams = Type.Object({ sessionId: Type.String({ minLength: 1 }) }, { additionalProperties: false });
const SessionItemParams = Type.Object(
	{ sessionId: Type.String({ minLength: 1 }), itemId: Type.String({ minLength: 1 }) },
	{ additionalProperties: false },
);

const QueueEntrySchema = Type.Object({
	id: Type.String(),
	behavior: Type.Union([Type.Literal("steer"), Type.Literal("followUp")]),
	kind: Type.Optional(Type.Union([Type.Literal("message"), Type.Literal("context_compaction")])),
	displayText: Type.String(),
});

export const SESSION_QUEUE_HOST_METHODS = {
	getQueueState: defineHostMethod({
		name: "session.getQueueState",
		params: SessionIdParams,
		result: Type.Object({ paused: Type.Boolean(), entries: Type.Array(QueueEntrySchema) }),
	}),
	queueContextCompaction: defineHostMethod({
		name: "session.queueContextCompaction",
		params: SessionIdParams,
		result: Type.Object({
			status: Type.Literal("queued"),
			id: Type.Optional(Type.String()),
			pendingCount: Type.Integer(),
		}),
	}),
	removeQueuedMessage: defineHostMethod({
		name: "session.removeQueuedMessage",
		params: SessionItemParams,
		result: Type.Boolean(),
	}),
	reorderQueuedMessages: defineHostMethod({
		name: "session.reorderQueuedMessages",
		params: Type.Object(
			{
				sessionId: Type.String({ minLength: 1 }),
				itemIds: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
			},
			{ additionalProperties: false },
		),
		result: Type.Null(),
	}),
	sendQueuedMessageNow: defineHostMethod({
		name: "session.sendQueuedMessageNow",
		params: SessionItemParams,
		result: Type.Union([Type.Literal("promoted"), Type.Literal("started"), Type.Literal("missing")]),
	}),
	resumeQueue: defineHostMethod({ name: "session.resumeQueue", params: SessionIdParams, result: Type.Null() }),
	clearQueue: defineHostMethod({ name: "session.clearQueue", params: SessionIdParams, result: Type.Null() }),
} as const;

export type SessionQueueHostMethods = HostMethodSignatures<typeof SESSION_QUEUE_HOST_METHODS>;
