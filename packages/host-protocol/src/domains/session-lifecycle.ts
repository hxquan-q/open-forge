// Copyright The Open Forge contributors.
import { Type } from "@sinclair/typebox";
import { defineHostMethod, type HostMethodSignatures } from "../method.js";

/**
 * 会话生命周期控制与删除子域合同（PLAN-0029 Phase 3 领域迁移，TASK-0475）。
 * 纯请求/响应：continue/abort 触碰 manual-stop 注册表；delete 保留所有权
 * 守卫与 ADR-0007 子目录回收；deleteAllForCwd 结果钉定 {deleted, failed}。
 * PROMPT/CREATE 等流式入口与事件推送不在本片。
 */

const SessionIdParams = Type.Object({ sessionId: Type.String({ minLength: 1 }) }, { additionalProperties: false });

export const SESSION_LIFECYCLE_HOST_METHODS = {
	continueSession: defineHostMethod({
		name: "session.continue",
		params: SessionIdParams,
		result: Type.Null(),
	}),
	abort: defineHostMethod({
		name: "session.abort",
		params: SessionIdParams,
		result: Type.Null(),
	}),
	delete: defineHostMethod({
		name: "session.delete",
		params: Type.Object({ sessionPath: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
		result: Type.Null(),
	}),
	deleteAllForCwd: defineHostMethod({
		name: "session.deleteAllForCwd",
		params: Type.Object({ cwd: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
		result: Type.Object(
			{ deleted: Type.Integer(), failed: Type.Array(Type.String()) },
			{ additionalProperties: false },
		),
	}),
};

export type SessionLifecycleHostMethods = HostMethodSignatures<typeof SESSION_LIFECYCLE_HOST_METHODS>;
