// Copyright The Open Forge contributors.

export type { HostClient, HostTransport } from "./client.js";
export { createHostClient } from "./client.js";
export { MCP_HOST_METHODS, type McpHostMethods } from "./domains/mcp.js";
export { MODELS_HOST_METHODS, type ModelsHostMethods } from "./domains/models.js";
export { SESSION_CATALOG_HOST_METHODS, type SessionCatalogHostMethods } from "./domains/session-catalog.js";
export { SESSION_DEFAULTS_HOST_METHODS, type SessionDefaultsHostMethods } from "./domains/session-defaults.js";
export { SESSION_EXECUTION_HOST_METHODS, type SessionExecutionHostMethods } from "./domains/session-execution.js";
export { SESSION_GOAL_HOST_METHODS, type SessionGoalHostMethods } from "./domains/session-goal.js";
export { SESSION_HISTORY_HOST_METHODS, type SessionHistoryHostMethods } from "./domains/session-history.js";
export { SESSION_LIFECYCLE_HOST_METHODS, type SessionLifecycleHostMethods } from "./domains/session-lifecycle.js";
export {
	SESSION_MCP_TASKS_HOST_METHODS,
	type SessionMcpTasksHostMethods,
} from "./domains/session-mcp-tasks.js";
export { SESSION_PLAN_MODE_HOST_METHODS, type SessionPlanModeHostMethods } from "./domains/session-plan-mode.js";
export { SESSION_QUEUE_HOST_METHODS, type SessionQueueHostMethods } from "./domains/session-queue.js";
export {
	SESSION_RUNTIME_OPS_HOST_METHODS,
	type SessionRuntimeOpsHostMethods,
} from "./domains/session-runtime-ops.js";
export { SESSION_TITLE_HOST_METHODS, type SessionTitleHostMethods } from "./domains/session-title.js";
export {
	ModelTransportSchema,
	SETTINGS_HOST_METHODS,
	SessionInterruptContinueSchema,
	SessionInterruptModeSchema,
	type SettingsHostMethods,
} from "./domains/settings.js";
export type { HostErrorPayload, HostRequest, HostResponse } from "./envelope.js";
export type { HostProtocolErrorCode } from "./errors.js";
export { HOST_PROTOCOL_ERROR_CODES, HostProtocolError, isHostProtocolErrorCode } from "./errors.js";
export type { HostCallContext, HostDomainImplementation, HostMethodHandler } from "./host.js";
export { createDirectHostTransport, HostDispatcher } from "./host.js";
export type {
	HostMethodDefinition,
	HostMethodSignature,
	HostMethodSignatureMap,
	HostMethodSignatures,
} from "./method.js";
export { defineHostMethod } from "./method.js";
export { HostOwnerRegistry } from "./owners.js";
export { type PortLike, portHostTransport, serveHostOnPort } from "./port-bridge.js";
export type { HostStreamEvent, HostStreamView } from "./stream.js";
export { reduceHostStream } from "./stream.js";
