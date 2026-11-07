// Copyright The Open Forge contributors.
import { Type } from "@sinclair/typebox";
import { defineHostMethod, type HostMethodSignatures } from "../method.js";

/**
 * 会话运行控制与后台任务子域合同（PLAN-0029 Phase 3 领域迁移，TASK-0473）。
 * 纯请求/响应：retry 前清 manual-stop 标记、interrupt 草稿注册表写、
 * 后台任务清理/中止与子代理中断均薄桥接既有注册表/extension。
 */

const SessionIdParams = Type.Object({ sessionId: Type.String({ minLength: 1 }) }, { additionalProperties: false });

export const SESSION_RUNTIME_OPS_HOST_METHODS = {
	retry: defineHostMethod({
		name: "session.retry",
		params: SessionIdParams,
		result: Type.Null(),
	}),
	setInterruptDraftNonEmpty: defineHostMethod({
		name: "session.setInterruptDraftNonEmpty",
		params: Type.Object(
			{ sessionId: Type.String({ minLength: 1 }), nonEmpty: Type.Boolean() },
			{ additionalProperties: false },
		),
		result: Type.Null(),
	}),
	getSessionPath: defineHostMethod({
		name: "session.getSessionPath",
		params: SessionIdParams,
		result: Type.Union([Type.String(), Type.Null()]),
	}),
	clearFinishedBackgroundTasks: defineHostMethod({
		name: "session.clearFinishedBackgroundTasks",
		params: SessionIdParams,
		result: Type.Number(),
	}),
	killBackgroundTask: defineHostMethod({
		name: "session.killBackgroundTask",
		params: Type.Object(
			{ sessionId: Type.String({ minLength: 1 }), taskId: Type.String({ minLength: 1 }) },
			{ additionalProperties: false },
		),
		result: Type.Boolean(),
	}),
	interruptSubagent: defineHostMethod({
		name: "session.interruptSubagent",
		params: Type.Object(
			{ sessionId: Type.String({ minLength: 1 }), target: Type.String({ minLength: 1 }) },
			{ additionalProperties: false },
		),
		result: Type.Boolean(),
	}),
};

export type SessionRuntimeOpsHostMethods = HostMethodSignatures<typeof SESSION_RUNTIME_OPS_HOST_METHODS>;
