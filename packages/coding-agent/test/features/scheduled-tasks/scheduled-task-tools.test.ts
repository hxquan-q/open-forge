// Copyright The Open Forge contributors.
import type { RuntimeToolDefinition, RuntimeToolExecutionRequest } from "@vetta/runtime-core/kernel";
import { defaultApprovalRequirement } from "@vetta/runtime-core/task";
import { describe, expect, it } from "vitest";
import { createApprovalToolInterceptor } from "../../../src/execution/permissions/approval-tool-interceptor.js";
import { summarizeToolApproval } from "../../../src/execution/permissions/summarize-tool-approval.js";
import { defaultToolRiskDescriptor } from "../../../src/execution/permissions/tool-risk-descriptors.js";
import {
	evaluatePlanModeToolCall,
	isToolVisibleInPlanMode,
} from "../../../src/features/plan-mode/plan-mode-tool-policy.js";
import type {
	AgentScheduledTask,
	AgentScheduledTaskCreate,
	AgentScheduledTaskPatch,
	ScheduledTaskStore,
} from "../../../src/features/scheduled-tasks/index.js";
import {
	createScheduledTaskToolRegistrations,
	SCHEDULED_TASK_CREATE_TOOL_NAME,
	SCHEDULED_TASK_DELETE_TOOL_NAME,
	SCHEDULED_TASK_LIST_TOOL_NAME,
	SCHEDULED_TASK_TOOL_NAMES,
	SCHEDULED_TASK_UPDATE_TOOL_NAME,
	scheduledTaskScopeKey,
} from "../../../src/features/scheduled-tasks/index.js";
import type { ToolInterceptionContext } from "../../../src/interception/tool/contracts.js";

const PROJECT = "C:/repo/alpha";
const OTHER_PROJECT = "C:/repo/beta";

function task(overrides: Partial<AgentScheduledTask>): AgentScheduledTask {
	return {
		id: "task-1",
		name: "daily checks",
		prompt: "run static checks",
		cron: "0 14 * * *",
		isOnce: false,
		enabled: true,
		cwd: PROJECT,
		createdAt: 1,
		updatedAt: 1,
		lastRunAt: null,
		lastRunStatus: null,
		...overrides,
	};
}

function createStoreFixture(initial: readonly AgentScheduledTask[]): {
	readonly store: ScheduledTaskStore;
	readonly created: AgentScheduledTaskCreate[];
	readonly updated: { taskId: string; patch: AgentScheduledTaskPatch }[];
	readonly deleted: string[];
} {
	const tasks = [...initial];
	const created: AgentScheduledTaskCreate[] = [];
	const updated: { taskId: string; patch: AgentScheduledTaskPatch }[] = [];
	const deleted: string[] = [];
	return {
		created,
		updated,
		deleted,
		store: {
			listTasks: async () => tasks,
			createTask: async (input) => {
				created.push(input);
				const created_ = task({
					...input,
					id: `task-${tasks.length + 1}`,
					isOnce: input.isOnce ?? false,
					enabled: input.enabled ?? true,
				});
				tasks.push(created_);
				return created_;
			},
			updateTask: async (taskId, patch) => {
				updated.push({ taskId, patch });
				const index = tasks.findIndex((candidate) => candidate.id === taskId);
				if (index < 0) return undefined;
				tasks[index] = { ...tasks[index], ...patch, updatedAt: tasks[index].updatedAt + 1 };
				return tasks[index];
			},
			deleteTask: async (taskId) => {
				deleted.push(taskId);
				const index = tasks.findIndex((candidate) => candidate.id === taskId);
				if (index < 0) return false;
				tasks.splice(index, 1);
				return true;
			},
		},
	};
}

function registrations(store: ScheduledTaskStore, projectCwd = PROJECT) {
	return createScheduledTaskToolRegistrations({ store, projectCwd });
}

function toolNamed(regs: ReturnType<typeof registrations>, name: string): RuntimeToolDefinition {
	const registration = regs.find((candidate) => candidate.tool.name === name);
	if (!registration) throw new Error(`missing tool ${name}`);
	return registration.tool;
}

function request(input: Readonly<Record<string, unknown>>, toolCallId = "call-1"): RuntimeToolExecutionRequest {
	return {
		sessionId: "session-1",
		turnId: "turn-1",
		toolCallId,
		input,
		signal: new AbortController().signal,
	};
}

describe("scheduled task tool registrations", () => {
	it("exposes list + create/update/delete with agent-control metadata", () => {
		const regs = registrations(createStoreFixture([]).store);
		expect(regs.map(({ tool }) => tool.name)).toEqual([...SCHEDULED_TASK_TOOL_NAMES]);
		for (const registration of regs) {
			expect(registration.category).toBe("agent-control");
			expect(registration.scopeUse).toContain("conversation");
			expect(registration.scopeUse).toContain("automation");
		}
	});

	it("declares the contract bounds in the input schemas", () => {
		const regs = registrations(createStoreFixture([]).store);
		const createSchema = toolNamed(regs, SCHEDULED_TASK_CREATE_TOOL_NAME).inputSchema as {
			required: readonly string[];
			properties: Record<string, { maxLength?: number }>;
		};
		expect(createSchema.required).toEqual(expect.arrayContaining(["name", "prompt", "cron"]));
		expect(createSchema.properties.name?.maxLength).toBe(80);
		expect(createSchema.properties.prompt?.maxLength).toBe(64000);
		const updateSchema = toolNamed(regs, SCHEDULED_TASK_UPDATE_TOOL_NAME).inputSchema as {
			required: readonly string[];
		};
		expect(updateSchema.required).toEqual(expect.arrayContaining(["task_id"]));
	});

	it("marks list low-risk direct and mutations approval-gated", () => {
		expect(defaultToolRiskDescriptor(SCHEDULED_TASK_LIST_TOOL_NAME)?.defaultLevel).toBe("L0");
		expect(defaultApprovalRequirement(defaultToolRiskDescriptor(SCHEDULED_TASK_LIST_TOOL_NAME)!.defaultLevel)).toBe(
			"auto",
		);
		for (const name of [
			SCHEDULED_TASK_CREATE_TOOL_NAME,
			SCHEDULED_TASK_UPDATE_TOOL_NAME,
			SCHEDULED_TASK_DELETE_TOOL_NAME,
		]) {
			const descriptor = defaultToolRiskDescriptor(name);
			expect(descriptor?.defaultLevel).toBe("L3");
			expect(defaultApprovalRequirement(descriptor!.defaultLevel)).toBe("per-call");
		}
		expect(defaultToolRiskDescriptor(SCHEDULED_TASK_DELETE_TOOL_NAME)?.irreversible).toBe(true);
	});

	it("lets plan mode list tasks but hides and rejects mutations", () => {
		expect(isToolVisibleInPlanMode(SCHEDULED_TASK_LIST_TOOL_NAME)).toBe(true);
		for (const name of [
			SCHEDULED_TASK_CREATE_TOOL_NAME,
			SCHEDULED_TASK_UPDATE_TOOL_NAME,
			SCHEDULED_TASK_DELETE_TOOL_NAME,
		]) {
			expect(isToolVisibleInPlanMode(name)).toBe(false);
			const verdict = evaluatePlanModeToolCall(name, {});
			expect(verdict.allowed).toBe(false);
			if (!verdict.allowed) expect(verdict.reason).toContain("exit_plan_mode");
		}
	});
});

describe("scheduled task tools", () => {
	it("lists only the tasks bound to the calling project", async () => {
		const fixture = createStoreFixture([
			task({ id: "a1", name: "alpha daily" }),
			task({ id: "b1", name: "beta weekly", cwd: OTHER_PROJECT }),
		]);
		const list = toolNamed(registrations(fixture.store), SCHEDULED_TASK_LIST_TOOL_NAME);

		const result = await list.execute(request({}));

		expect(result.isError).toBeUndefined();
		const text = result.content[0].type === "text" ? result.content[0].text : "";
		expect(text).toContain("alpha daily");
		expect(text).toContain("a1");
		expect(text).not.toContain("beta weekly");
		expect(result.details).toMatchObject({ operation: "list", taskCount: 1 });
	});

	it("normalizes platform path spellings when matching the project scope", async () => {
		const fixture = createStoreFixture([task({ id: "a1", cwd: "C:\\repo\\alpha\\" })]);
		const list = toolNamed(registrations(fixture.store), SCHEDULED_TASK_LIST_TOOL_NAME);

		const result = await list.execute(request({}));

		expect(result.details).toMatchObject({ taskCount: 1 });
		expect(scheduledTaskScopeKey("C:\\A\\B\\")).toBe(scheduledTaskScopeKey("c:/a/b"));
	});

	it("reports an empty project without error", async () => {
		const fixture = createStoreFixture([task({ id: "b1", cwd: OTHER_PROJECT })]);
		const list = toolNamed(registrations(fixture.store), SCHEDULED_TASK_LIST_TOOL_NAME);

		const result = await list.execute(request({}));

		expect(result.isError).toBeUndefined();
		expect(result.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("No scheduled tasks") });
	});

	it("creates tasks pinned to the session project with defaults", async () => {
		const fixture = createStoreFixture([]);
		const create = toolNamed(registrations(fixture.store), SCHEDULED_TASK_CREATE_TOOL_NAME);

		const result = await create.execute(request({ name: "静态检查", prompt: "run lint", cron: "0 14 * * *" }));

		expect(result.isError).toBeUndefined();
		expect(fixture.created).toEqual([
			{ name: "静态检查", prompt: "run lint", cron: "0 14 * * *", isOnce: false, enabled: true, cwd: PROJECT },
		]);
		expect(result.content[0]).toMatchObject({ text: expect.stringContaining('cron "0 14 * * *"') });
	});

	it("honours explicit isOnce/enabled flags on create", async () => {
		const fixture = createStoreFixture([]);
		const create = toolNamed(registrations(fixture.store), SCHEDULED_TASK_CREATE_TOOL_NAME);

		await create.execute(
			request({ name: "one-off", prompt: "do it", cron: "0 9 * * 1", isOnce: true, enabled: false }),
		);

		expect(fixture.created[0]).toMatchObject({ isOnce: true, enabled: false });
	});

	it("updates in-scope tasks only", async () => {
		const fixture = createStoreFixture([task({ id: "a1" }), task({ id: "b1", name: "other", cwd: OTHER_PROJECT })]);
		const update = toolNamed(registrations(fixture.store), SCHEDULED_TASK_UPDATE_TOOL_NAME);

		const result = await update.execute(request({ task_id: "a1", cron: "0 9 * * *", enabled: false }));

		expect(result.isError).toBeUndefined();
		expect(fixture.updated).toEqual([{ taskId: "a1", patch: { cron: "0 9 * * *", enabled: false } }]);
		expect(result.content[0]).toMatchObject({ text: expect.stringContaining("Updated scheduled task") });
	});

	it("returns NOT_FOUND for cross-project and unknown ids without touching the store", async () => {
		const fixture = createStoreFixture([task({ id: "b1", cwd: OTHER_PROJECT })]);
		const regs = registrations(fixture.store);
		const update = toolNamed(regs, SCHEDULED_TASK_UPDATE_TOOL_NAME);
		const del = toolNamed(regs, SCHEDULED_TASK_DELETE_TOOL_NAME);

		const crossUpdate = await update.execute(request({ task_id: "b1", name: "hijack" }));
		const missingUpdate = await update.execute(request({ task_id: "ghost", name: "hijack" }));
		const crossDelete = await del.execute(request({ task_id: "b1" }));
		const missingDelete = await del.execute(request({ task_id: "ghost" }));

		for (const result of [crossUpdate, missingUpdate, crossDelete, missingDelete]) {
			expect(result.isError).toBe(true);
			expect(result.content[0]).toMatchObject({ text: expect.stringContaining("NOT_FOUND") });
		}
		expect(fixture.updated).toEqual([]);
		expect(fixture.deleted).toEqual([]);
	});

	it("rejects an update with no fields", async () => {
		const fixture = createStoreFixture([task({ id: "a1" })]);
		const update = toolNamed(registrations(fixture.store), SCHEDULED_TASK_UPDATE_TOOL_NAME);

		const result = await update.execute(request({ task_id: "a1" }));

		expect(result.isError).toBe(true);
		expect(result.content[0]).toMatchObject({ text: expect.stringContaining("at least one field") });
		expect(fixture.updated).toEqual([]);
	});

	it("deletes in-scope tasks and reports the name", async () => {
		const fixture = createStoreFixture([task({ id: "a1", name: "daily" })]);
		const del = toolNamed(registrations(fixture.store), SCHEDULED_TASK_DELETE_TOOL_NAME);

		const result = await del.execute(request({ task_id: "a1" }));

		expect(result.isError).toBeUndefined();
		expect(fixture.deleted).toEqual(["a1"]);
		expect(result.content[0]).toMatchObject({ text: expect.stringContaining('"daily"') });
	});

	it("surfaces store errors as tool error results", async () => {
		const store: ScheduledTaskStore = {
			listTasks: async () => [],
			createTask: async () => {
				throw new Error("Cron 表达式无效。");
			},
			updateTask: async () => undefined,
			deleteTask: async () => false,
		};
		const create = toolNamed(registrations(store), SCHEDULED_TASK_CREATE_TOOL_NAME);

		const result = await create.execute(request({ name: "x", prompt: "y", cron: "bogus" }));

		expect(result.isError).toBe(true);
		expect(result.content[0]).toMatchObject({ text: "Error: Cron 表达式无效。" });
	});
});

describe("scheduled task approval gate", () => {
	function interceptorWith(port: { requests: string[] }) {
		return createApprovalToolInterceptor({
			approvalPort: {
				isAvailable: () => true,
				request: async (input) => {
					port.requests.push(`${input.toolName}:${input.summary}`);
					return { decision: "approve" };
				},
			},
			resolveRiskDescriptor: defaultToolRiskDescriptor,
			summarize: summarizeToolApproval,
		});
	}

	function context(tool: RuntimeToolDefinition, input: Readonly<Record<string, unknown>>): ToolInterceptionContext {
		return {
			tool,
			request: {
				sessionId: "session-1",
				turnId: "turn-1",
				toolCallId: "call-1",
				input: {},
				signal: new AbortController().signal,
			},
			frameContext: undefined,
			input,
		};
	}

	it("routes mutations through the approval port while list stays direct", async () => {
		const port = { requests: [] as string[] };
		const interceptor = interceptorWith(port);
		const regs = registrations(createStoreFixture([]).store);

		const listVerdict = await interceptor.before?.(context(toolNamed(regs, SCHEDULED_TASK_LIST_TOOL_NAME), {}));
		expect(listVerdict).toBeUndefined();
		expect(port.requests).toEqual([]);

		const createVerdict = await interceptor.before?.(
			context(toolNamed(regs, SCHEDULED_TASK_CREATE_TOOL_NAME), {
				name: "daily",
				prompt: "run",
				cron: "0 14 * * *",
			}),
		);
		expect(createVerdict?.block).toBeUndefined();
		expect(port.requests).toHaveLength(1);
		expect(port.requests[0]).toContain("scheduled_task_create");
		expect(port.requests[0]).toContain("daily");
		expect(port.requests[0]).toContain("0 14 * * *");

		const deleteVerdict = await interceptor.before?.(
			context(toolNamed(regs, SCHEDULED_TASK_DELETE_TOOL_NAME), { task_id: "a1" }),
		);
		expect(deleteVerdict?.block).toBeUndefined();
		expect(port.requests[1]).toContain("scheduled_task_delete");
		expect(port.requests[1]).toContain("a1");
	});
});
