// Copyright The Open Forge contributors.
import { Type } from "@sinclair/typebox";
import { defineHostMethod, type HostMethodSignatures } from "../method.js";

/**
 * MCP 任务与待答清单子域合同（PLAN-0029 Phase 3 领域迁移，TASK-0476）。
 * 纯读取/操作：MCP_TASKS_CHANGED 推送事件与 question/plan-review 应答
 * （窗口闭包耦合）不在本片，仍走旧 IPC。
 */

const McpTaskStatusSchema = Type.Union([
	Type.Literal("working"),
	Type.Literal("input_required"),
	Type.Literal("completed"),
	Type.Literal("failed"),
	Type.Literal("cancelled"),
]);

const McpTaskSchema = Type.Object(
	{
		id: Type.String(),
		sessionId: Type.String(),
		toolCallId: Type.String(),
		serverName: Type.String(),
		toolName: Type.String(),
		status: McpTaskStatusSchema,
		statusMessage: Type.Optional(Type.String()),
		createdAt: Type.String(),
		lastUpdatedAt: Type.String(),
		recovered: Type.Optional(Type.Boolean()),
	},
	{ additionalProperties: false },
);

const McpElicitationValueSchema = Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Array(Type.String())]);

const McpElicitationFieldSchema = Type.Object(
	{
		key: Type.String(),
		kind: Type.Union([
			Type.Literal("string"),
			Type.Literal("number"),
			Type.Literal("integer"),
			Type.Literal("boolean"),
			Type.Literal("single-select"),
			Type.Literal("multi-select"),
		]),
		title: Type.String(),
		description: Type.Optional(Type.String()),
		required: Type.Boolean(),
		defaultValue: Type.Optional(McpElicitationValueSchema),
		format: Type.Optional(
			Type.Union([Type.Literal("email"), Type.Literal("uri"), Type.Literal("date"), Type.Literal("date-time")]),
		),
		minLength: Type.Optional(Type.Number()),
		maxLength: Type.Optional(Type.Number()),
		minimum: Type.Optional(Type.Number()),
		maximum: Type.Optional(Type.Number()),
		minItems: Type.Optional(Type.Number()),
		maxItems: Type.Optional(Type.Number()),
		options: Type.Optional(Type.Array(Type.Object({ value: Type.String(), label: Type.String() }))),
	},
	{ additionalProperties: false },
);

const McpElicitationRequestSchema = Type.Union([
	Type.Object(
		{
			requestId: Type.String(),
			sessionId: Type.String(),
			serverName: Type.String(),
			mode: Type.Literal("form"),
			message: Type.String(),
			fields: Type.Array(McpElicitationFieldSchema),
		},
		{ additionalProperties: false },
	),
	Type.Object(
		{
			requestId: Type.String(),
			sessionId: Type.String(),
			serverName: Type.String(),
			mode: Type.Literal("url"),
			message: Type.String(),
			url: Type.String(),
		},
		{ additionalProperties: false },
	),
]);

export const SESSION_MCP_TASKS_HOST_METHODS = {
	mcpTasksList: defineHostMethod({
		name: "session.mcpTasksList",
		params: Type.Object({ sessionId: Type.Optional(Type.String({ minLength: 1 })) }, { additionalProperties: false }),
		result: Type.Array(McpTaskSchema),
	}),
	mcpTasksCancel: defineHostMethod({
		name: "session.mcpTasksCancel",
		params: Type.Object({ id: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
		result: Type.Boolean(),
	}),
	mcpTasksClearFinished: defineHostMethod({
		name: "session.mcpTasksClearFinished",
		params: Type.Object({ sessionId: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
		result: Type.Number(),
	}),
	mcpElicitationListPending: defineHostMethod({
		name: "session.mcpElicitationListPending",
		params: Type.Object({}, { additionalProperties: false }),
		result: Type.Array(McpElicitationRequestSchema),
	}),
};

export type SessionMcpTasksHostMethods = HostMethodSignatures<typeof SESSION_MCP_TASKS_HOST_METHODS>;
