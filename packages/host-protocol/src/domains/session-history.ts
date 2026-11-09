// Copyright The Open Forge contributors.
import { Type } from "@sinclair/typebox";
import { defineHostMethod, type HostMethodSignatures } from "../method.js";

/**
 * 会话历史分支子域合同（PLAN-0029 Phase 3 领域迁移，TASK-0468）。
 * 纯请求/响应：安全写命令全部桥接 RuntimeHost `RuntimeSessionHistoryController`
 * （活动 Turn 互斥、分支持久化与 Agent 上下文同步语义留在 Runtime 一侧）。
 */

const SessionEntryParams = Type.Object(
	{ sessionId: Type.String({ minLength: 1 }), entryId: Type.String({ minLength: 1 }) },
	{ additionalProperties: false },
);

export const SESSION_HISTORY_HOST_METHODS = {
	navigateForEdit: defineHostMethod({
		name: "session.navigateForEdit",
		params: SessionEntryParams,
		result: Type.Object({ text: Type.String(), cancelled: Type.Boolean() }, { additionalProperties: false }),
	}),
	switchBranch: defineHostMethod({
		name: "session.switchBranch",
		params: SessionEntryParams,
		result: Type.Object({ leafId: Type.String() }, { additionalProperties: false }),
	}),
	deleteMessage: defineHostMethod({
		name: "session.deleteMessage",
		params: SessionEntryParams,
		result: Type.Object({ leafId: Type.Union([Type.String(), Type.Null()]) }, { additionalProperties: false }),
	}),
	replaceLastUserMessage: defineHostMethod({
		name: "session.replaceLastUserMessage",
		params: SessionEntryParams,
		result: Type.Object({ leafId: Type.Union([Type.String(), Type.Null()]) }, { additionalProperties: false }),
	}),
	forkSession: defineHostMethod({
		name: "session.forkSession",
		params: SessionEntryParams,
		result: Type.Object({ path: Type.String(), text: Type.String() }, { additionalProperties: false }),
	}),
};

export type SessionHistoryHostMethods = HostMethodSignatures<typeof SESSION_HISTORY_HOST_METHODS>;
