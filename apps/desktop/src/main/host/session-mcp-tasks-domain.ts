// Copyright The Open Forge contributors.
import type { HostDomainImplementation, SESSION_MCP_TASKS_HOST_METHODS } from "@vetta/host-protocol";
import { getDesktopMcpElicitationBroker } from "../conversations/mcp-elicitation-broker.js";
import { getDesktopMcpTaskCoordinator, getDesktopMcpTaskRegistry } from "../mcp/mcp-task-runtime.js";

/**
 * MCP 任务与待答清单子域的 Host 实现（TASK-0476）：与旧 IPC handler 同职责——
 * 任务清单/清理走注册表，取消走执行协调器，待答清单走 elicitation broker。
 * readonly 结果展平为可变数组以满足合同形状。
 */
export const sessionMcpTasksHostDomain: HostDomainImplementation<typeof SESSION_MCP_TASKS_HOST_METHODS> = {
	mcpTasksList: async ({ sessionId }) => [...(await getDesktopMcpTaskRegistry().listPublic(sessionId))],
	mcpTasksCancel: ({ id }) => getDesktopMcpTaskCoordinator().cancel(id),
	mcpTasksClearFinished: ({ sessionId }) => getDesktopMcpTaskRegistry().clearTerminal(sessionId),
	mcpElicitationListPending: () =>
		Promise.resolve(
			getDesktopMcpElicitationBroker()
				.listPending()
				.map((request) =>
					request.mode === "form"
						? {
								...request,
								fields: request.fields.map((field) => ({
									...field,
									options: field.options ? [...field.options] : undefined,
								})),
							}
						: { ...request },
				),
		),
};
