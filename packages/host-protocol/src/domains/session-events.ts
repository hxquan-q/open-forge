// Copyright The Open Forge contributors.
import { Type } from "@sinclair/typebox";
import { defineHostMethod, type HostMethodSignatures } from "../method.js";

/**
 * 会话事件订阅原语（PLAN-0029 Phase 3，TASK-0477）：subscribe 建立连接级订阅并回放三份快照，
 * 后续事件经 MessagePort 事件帧推送；unsubscribe 与端口关闭摘除订阅。
 * 事件 payload 暂保持 slim 后的 SessionEvent 原样透传，形状随 reduceHostStream 域迁移逐步收窄。
 */

export const SESSION_EVENTS_HOST_METHODS = {
	subscribe: defineHostMethod({
		name: "session.subscribe",
		params: Type.Object({ sessionId: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
		result: Type.Object({ subscriptionId: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
	}),
	unsubscribe: defineHostMethod({
		name: "session.unsubscribe",
		params: Type.Object({ subscriptionId: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
		result: Type.Null(),
	}),
};

export type SessionEventsHostMethods = HostMethodSignatures<typeof SESSION_EVENTS_HOST_METHODS>;
