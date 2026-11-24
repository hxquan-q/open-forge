// Modified by The Open Forge contributors.
import { type Static, Type } from "@sinclair/typebox";
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import type { SubagentCoordinatorPort, SubagentTypeDefinition } from "@vetta/runtime-subagents";
import { ToolCallDescriptionSchema } from "@vetta/runtime-tools/coding";
import type { CodingAgentSubagentProfile } from "../../../contracts/index.js";
import { resolveSubagentTaskMessage, SubagentTaskContractSchema } from "../../task-contract.js";
import { SPAWN_AGENT_TOOL_DESCRIPTION } from "./description.js";

export const SpawnAgentToolInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	task_name: Type.String({
		description:
			"Unique snake_case name for this child under the root (e.g. api_trace). Lowercase letters, digits, underscore; start with a letter.",
	}),
	task: Type.Optional(SubagentTaskContractSchema),
	message: Type.Optional(
		Type.String({
			description: "Legacy task text. New calls must use the structured task contract.",
		}),
	),
	agent_type: Type.String({
		description: "Registered subagent type id (e.g. explorer). See tool description for available types.",
	}),
});

export type SpawnAgentToolInput = Static<typeof SpawnAgentToolInputSchema>;

export interface SpawnAgentToolOptions {
	readonly getCoordinator: () => SubagentCoordinatorPort | undefined;
	/** 会话注册表读取口：resident 成员的重复 spawn 守卫需要类型定义；缺省不设防。 */
	readonly getType?: (agentType: string) => SubagentTypeDefinition<CodingAgentSubagentProfile> | undefined;
}

export function createSpawnAgentTool(options: SpawnAgentToolOptions): RuntimeToolDefinition<SpawnAgentToolInput> {
	return {
		name: "spawn_agent",
		label: "spawn_agent",
		description: SPAWN_AGENT_TOOL_DESCRIPTION,
		inputSchema: SpawnAgentToolInputSchema,
		async execute({ input, toolCallId }) {
			const coordinator = requireCoordinator(options);
			assertResidentMemberNotDuplicated(options, coordinator, input.agent_type);
			const message = resolveSubagentTaskMessage(input);
			const snapshot = await coordinator.spawn({
				taskName: input.task_name,
				message,
				agentType: input.agent_type,
				originToolCallId: toolCallId,
			});
			const text = [
				`Spawned subagent ${snapshot.id}`,
				`path: ${snapshot.path}`,
				`type: ${snapshot.agentType}`,
				`status: ${snapshot.status}`,
				`task_name: ${snapshot.taskName}`,
				"Use wait_agent to join, or continue and handle <subagent_notification>.",
			].join("\n");
			return {
				content: [{ type: "text", text }],
				details: { ...snapshot },
			};
		},
	};
}

/**
 * 常驻成员守卫（REQ-0034）：resident 成员在本会话内只允许一个实例
 * （spawn 一次 durable 会话 + followup_task 排队语义）。已有同类型子代理时拒绝
 * 再次 spawn，并把 followup_task 的目标名告诉模型，保证「绝不重复起实例」。
 */
function assertResidentMemberNotDuplicated(
	options: SpawnAgentToolOptions,
	coordinator: SubagentCoordinatorPort,
	agentType: string,
): void {
	const type = options.getType?.(agentType);
	if (type?.profile.delegation?.lifecycle !== "resident") return;
	const existing = coordinator.list().find((agent) => agent.agentType === agentType);
	if (!existing) return;
	throw new Error(
		[
			`Resident crew member "${type.label}" already has a session instance (${existing.path}, status=${existing.status}).`,
			`Never spawn it again: send follow-up work with followup_task(target="${existing.taskName}", message=...).`,
			"Follow-ups queue in order while the member is busy and resume its transcript when idle.",
		].join(" "),
	);
}

function requireCoordinator(options: SpawnAgentToolOptions): SubagentCoordinatorPort {
	const coordinator = options.getCoordinator();
	if (!coordinator) throw new Error("Subagents are not enabled for this session.");
	return coordinator;
}
