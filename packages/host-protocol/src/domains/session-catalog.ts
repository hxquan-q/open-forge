// Copyright The Open Forge contributors.
import { Type } from "@sinclair/typebox";
import { defineHostMethod, type HostMethodSignatures } from "../method.js";

/**
 * 会话目录子域合同（PLAN-0029 Phase 3 领域迁移，TASK-0474）。
 * 纯读取：项目/历史/运行中会话目录。`DesktopSessionHistoryInfo` 形状钉定
 * （SessionHistoryInfo 14 字段 + access 四布尔 + agentMode?，ADR-0051/0151）。
 */

const NoParams = Type.Object({}, { additionalProperties: false });

const SessionAccessSchema = Type.Object(
	{
		readHistory: Type.Boolean(),
		resume: Type.Boolean(),
		rename: Type.Boolean(),
		delete: Type.Boolean(),
	},
	{ additionalProperties: false },
);

const SessionHistoryInfoSchema = Type.Object(
	{
		id: Type.String(),
		path: Type.String(),
		agentId: Type.Optional(Type.String()),
		cwd: Type.String(),
		name: Type.Optional(Type.String()),
		firstMessage: Type.String(),
		modifiedAt: Type.Integer(),
		lastMessagePreview: Type.Optional(Type.String()),
		fileSizeBytes: Type.Optional(Type.Integer()),
		parentSessionPath: Type.Optional(Type.String()),
		parentEntryId: Type.Optional(Type.String()),
		access: SessionAccessSchema,
		agentMode: Type.Optional(Type.String()),
	},
	{ additionalProperties: false },
);

export const SESSION_CATALOG_HOST_METHODS = {
	listProjects: defineHostMethod({
		name: "session.listProjects",
		params: NoParams,
		result: Type.Array(
			Type.Object({ cwd: Type.String(), sessionCount: Type.Integer() }, { additionalProperties: false }),
		),
	}),
	listSessions: defineHostMethod({
		name: "session.listSessions",
		params: Type.Object({ cwd: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
		result: Type.Array(SessionHistoryInfoSchema),
	}),
	listRunning: defineHostMethod({
		name: "session.listRunning",
		params: NoParams,
		result: Type.Array(Type.String()),
	}),
	listRunningCwds: defineHostMethod({
		name: "session.listRunningCwds",
		params: NoParams,
		result: Type.Array(Type.String()),
	}),
};

export type SessionCatalogHostMethods = HostMethodSignatures<typeof SESSION_CATALOG_HOST_METHODS>;
