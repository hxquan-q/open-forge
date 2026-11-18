// Modified by The Open Forge contributors.

import type { RuntimeToolExecutionRequest } from "@vetta/runtime-core/kernel";
import type { SubagentCoordinatorPort, SubagentSnapshot, SubagentTypeDefinition } from "@vetta/runtime-subagents";
import { emptyUsage, taskPath } from "@vetta/runtime-subagents";
import { describe, expect, it, vi } from "vitest";
import type { CodingAgentSubagentProfile } from "../../src/composition/contracts/index.js";
import {
	createSpawnAgentTool,
	type SpawnAgentToolInput,
} from "../../src/composition/subagent/tools/spawn-agent/spawn-agent-tool.js";

function residentType(): SubagentTypeDefinition<CodingAgentSubagentProfile> {
	return {
		id: "member:agent-1",
		label: "Eform Developer",
		description: "worker",
		profile: {
			systemPromptAddon: "persona",
			delegation: { lifecycle: "resident" },
		},
	};
}

function snapshotOf(taskName: string, status: SubagentSnapshot["status"]): SubagentSnapshot {
	return {
		id: `child-${taskName}`,
		taskName,
		path: taskPath(taskName),
		agentType: "member:agent-1",
		status,
		task: "contract",
		parentSessionId: "parent",
		startedAt: 0,
		usage: emptyUsage(),
		generation: 0,
	};
}

function coordinatorWith(agents: readonly SubagentSnapshot[]): SubagentCoordinatorPort {
	return {
		list: () => [...agents],
		get: () => undefined,
		clearFinished: () => 0,
		registeredTypeIds: () => ["member:agent-1"],
		spawn: vi.fn(async () => snapshotOf("m_agent_1", "running")),
		spawnMany: () => [],
		sendMessage: vi.fn(async () => snapshotOf("m_agent_1", "running")),
		followUp: vi.fn(async () => snapshotOf("m_agent_1", "running")),
		interrupt: () => snapshotOf("m_agent_1", "interrupted"),
		interruptAll: () => [],
		wait: vi.fn(async () => ({ timedOut: false, agents: [] })),
		dispose: vi.fn(async () => {}),
	};
}

const contractInput = {
	description: "why",
	task_name: "m_agent_1",
	agent_type: "member:agent-1",
	task: {
		history: "h",
		current_state: "c",
		objective: "o",
		scope: "s",
		constraints: ["c1"],
		relevant_context: ["r1"],
		deliverables: ["d1"],
		validation: ["v1"],
	},
};

const abortController = new AbortController();

function executeRequest(toolCallId: string): RuntimeToolExecutionRequest<SpawnAgentToolInput> {
	return {
		sessionId: "session-1",
		turnId: "turn-1",
		toolCallId,
		input: contractInput,
		signal: abortController.signal,
	};
}

describe("spawn_agent resident crew guard", () => {
	it("rejects a second spawn while the resident member already has an instance (running)", async () => {
		const coordinator = coordinatorWith([snapshotOf("m_agent_1", "running")]);
		const tool = createSpawnAgentTool({
			getCoordinator: () => coordinator,
			getType: (id) => (id === "member:agent-1" ? residentType() : undefined),
		});
		await expect(tool.execute(executeRequest("tc1"))).rejects.toThrow(/followup_task\(target="m_agent_1"/);
		expect(coordinator.spawn).not.toHaveBeenCalled();
	});

	it("still rejects when the resident instance is terminal: follow-up resumes its transcript", async () => {
		const coordinator = coordinatorWith([snapshotOf("m_agent_1", "completed")]);
		const tool = createSpawnAgentTool({
			getCoordinator: () => coordinator,
			getType: (id) => (id === "member:agent-1" ? residentType() : undefined),
		});
		await expect(tool.execute(executeRequest("tc1"))).rejects.toThrow(/already has a session instance/);
	});

	it("lets the first spawn through and names the member instance in the result", async () => {
		const coordinator = coordinatorWith([]);
		const tool = createSpawnAgentTool({
			getCoordinator: () => coordinator,
			getType: (id) => (id === "member:agent-1" ? residentType() : undefined),
		});
		const result = await tool.execute(executeRequest("tc1"));
		expect(coordinator.spawn).toHaveBeenCalledOnce();
		expect(result.content[0]).toMatchObject({ type: "text" });
	});

	it("does not guard one-shot members or types without a registry view", async () => {
		const oneshot = {
			...residentType(),
			profile: { ...residentType().profile, delegation: { lifecycle: "oneshot" as const } },
		};
		const coordinator = coordinatorWith([snapshotOf("task_a", "running"), snapshotOf("task_b", "running")]);
		const tool = createSpawnAgentTool({
			getCoordinator: () => coordinator,
			getType: (id) => (id === "member:agent-1" ? oneshot : undefined),
		});
		await expect(tool.execute(executeRequest("tc1"))).resolves.toBeTruthy();

		const noRegistry = createSpawnAgentTool({ getCoordinator: () => coordinator });
		await expect(noRegistry.execute(executeRequest("tc2"))).resolves.toBeTruthy();
	});
});
