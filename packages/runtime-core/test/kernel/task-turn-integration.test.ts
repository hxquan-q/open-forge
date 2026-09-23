import type { AssistantMessage, UserMessage } from "@vetta/ai";
import { describe, expect, it } from "vitest";
import {
	type ArtifactDescriptorRecordedEvent,
	type Clock,
	type ContextStrategy,
	type ConversationMetadata,
	type ConversationRepository,
	type CreateConversationInput,
	createAgentSession,
	type EventSink,
	type IdGenerator,
	type KernelEvent,
	type PreparedContext,
	type RuntimeInputRequestPreparer,
	type RuntimeSnapshot,
	resumeAgentSession,
	type SessionInputRequest,
	StaticRuntimeSnapshotProvider,
	type StoredConversation,
	type StoredSessionEvent,
	type TaskLifecycleRecordedEvent,
	type TurnEngineEvent,
	type TurnEnginePort,
	type TurnEngineRequest,
	TurnPipeline,
} from "../../src/kernel/index.js";
import {
	createRuntimeTaskSnapshot,
	projectRuntimeSessionTaskState,
	type RuntimeTaskEvent,
	type RuntimeTaskIdentity,
	transitionRuntimeTask,
} from "../../src/task/index.js";

class TestClock implements Clock {
	private current = 100;

	now(): number {
		this.current += 1;
		return this.current;
	}
}

class TestIdGenerator implements IdGenerator {
	private current = 0;

	next(): string {
		this.current += 1;
		return `turn-${this.current}`;
	}
}

class CollectingEventSink implements EventSink {
	readonly events: KernelEvent[] = [];

	async publish(event: KernelEvent): Promise<void> {
		this.events.push(event);
	}
}

class InMemoryConversationRepository implements ConversationRepository {
	private readonly conversations = new Map<string, StoredConversation>();

	async create(input: CreateConversationInput): Promise<ConversationMetadata> {
		const conversation: StoredConversation = {
			sessionId: input.sessionId,
			createdAt: input.createdAt,
			version: 0,
			messages: [],
			events: [],
		};
		this.conversations.set(input.sessionId, conversation);
		return conversation;
	}

	async load(sessionId: string): Promise<StoredConversation> {
		const conversation = this.conversations.get(sessionId);
		if (!conversation) throw new Error(`Conversation not found: ${sessionId}`);
		return conversation;
	}

	async append(
		sessionId: string,
		expectedVersion: number,
		events: readonly StoredSessionEvent[],
	): Promise<{ readonly version: number }> {
		const conversation = await this.load(sessionId);
		if (conversation.version !== expectedVersion) throw new Error("Version conflict");
		const messages = [...conversation.messages];
		for (const event of events) {
			if (event.type === "message.appended") messages.push(event.message);
		}
		const version = expectedVersion + events.length;
		this.conversations.set(sessionId, {
			...conversation,
			version,
			messages,
			events: [...conversation.events, ...events],
		});
		return { version };
	}

	async saveSnapshot(): Promise<void> {}

	async close(): Promise<void> {}
}

class PassthroughContextStrategy implements ContextStrategy {
	async prepare(input: Parameters<ContextStrategy["prepare"]>[0], signal: AbortSignal): Promise<PreparedContext> {
		signal.throwIfAborted();
		return { messages: input.messages, estimatedTokens: input.messages.length };
	}
}

class CompletingTurnEngine implements TurnEnginePort {
	async *execute(request: TurnEngineRequest): AsyncIterable<TurnEngineEvent> {
		request.signal.throwIfAborted();
		yield { type: "message", message: assistantMessage("done") };
		yield { type: "completed", stopReason: "stop" };
	}
}

class FailingTurnEngine implements TurnEnginePort {
	async *execute(request: TurnEngineRequest): AsyncIterable<TurnEngineEvent> {
		request.signal.throwIfAborted();
		yield {
			type: "observation",
			observation: { type: "message.delta", delta: "partial", source: "agent" },
		};
		throw new Error("provider exploded");
	}
}

function snapshot(): RuntimeSnapshot {
	return {
		id: "snapshot-1",
		instructions: [],
		tools: new Map(),
		contextProviders: [],
		contextStrategy: new PassthroughContextStrategy(),
		toolPolicy: {
			async authorize() {
				return true;
			},
		},
		tokenBudget: 8_000,
		reservedOutputTokens: 1_000,
		observers: [],
	};
}

function assistantMessage(text: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "openai-responses",
		provider: "openai",
		model: "test-model",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: 2,
	};
}

const passthroughPreparer: RuntimeInputRequestPreparer = {
	async prepare(request) {
		return { action: "continue", input: { message: userMessage(request.displayText) } };
	},
};

function userMessage(text: string): UserMessage {
	return { role: "user", content: text, timestamp: 1 };
}

function inputRequest(text: string): SessionInputRequest {
	return { payload: { text }, displayText: text };
}

async function createHarness(turnEngine: TurnEnginePort = new CompletingTurnEngine()) {
	const repository = new InMemoryConversationRepository();
	const eventSink = new CollectingEventSink();
	const pipeline = new TurnPipeline({
		repository,
		snapshotProvider: new StaticRuntimeSnapshotProvider(snapshot()),
		turnEngine,
		eventSink,
		clock: new TestClock(),
		idGenerator: new TestIdGenerator(),
	});
	const session = await createAgentSession({ id: "session-1", pipeline });
	return { repository, eventSink, pipeline, session };
}

const identity: RuntimeTaskIdentity = {
	taskId: "task-1",
	rootSessionId: "session-1",
	generation: "generation-1",
};

/** 宿主提交「创建 Task 并进入 planning」的事实，等价于用户升级会话为任务。 */
async function recordPlanningTask(session: {
	recordTaskFacts(facts: readonly (TaskLifecycleRecordedEvent | ArtifactDescriptorRecordedEvent)[]): Promise<void>;
}): Promise<void> {
	const initial = createRuntimeTaskSnapshot({ identity, title: "整理季度材料", at: 100 });
	const created: RuntimeTaskEvent = {
		schemaVersion: 1,
		taskId: identity.taskId,
		eventId: "task-1:created",
		at: 100,
		type: "task.created",
		snapshot: initial,
	};
	const planned = transitionRuntimeTask(initial, {
		eventId: "task-1:plan",
		at: 101,
		intent: { type: "plan" },
	});
	await session.recordTaskFacts(
		[created, ...planned.events].map((task) => ({
			type: "task.lifecycle.recorded" as const,
			sessionId: identity.rootSessionId,
			task,
			timestamp: task.at,
		})),
	);
}

function taskSnapshots(conversation: StoredConversation) {
	return projectRuntimeSessionTaskState(conversation.events).tasks;
}

describe("Task 事实与 Turn 生命周期的内核集成", () => {
	it("用户升级会话为任务后，下一次 Turn 自动绑定并推进到运行中", async () => {
		const { repository, session } = await createHarness();
		await recordPlanningTask(session);

		const result = await session.sendRequest(inputRequest("总结这份材料"), {}, passthroughPreparer);
		expect(result.status).toBe("completed");

		const tasks = taskSnapshots(await repository.load(identity.rootSessionId));
		expect(tasks).toHaveLength(1);
		expect(tasks[0].status).toBe("awaiting_review");
		expect(tasks[0].activeTurnId).toBe("turn-1");
	});

	it("事件顺序：turn.started 先于 Task 绑定，turn.completed 先于 Task 进入 awaiting_review", async () => {
		const { repository, session } = await createHarness();
		await recordPlanningTask(session);
		await session.sendRequest(inputRequest("继续"), {}, passthroughPreparer);

		const types = (await repository.load(identity.rootSessionId)).events.map((event) =>
			event.type === "task.lifecycle.recorded" ? `task:${event.task.type}` : event.type,
		);
		const startedAt = types.indexOf("turn.started");
		const bindAt = types.indexOf("task:task.turn_bound");
		const completedAt = types.indexOf("turn.completed");
		const reviewAt = types.lastIndexOf("task:task.status_changed");
		expect(startedAt).toBeGreaterThanOrEqual(0);
		expect(bindAt).toBeGreaterThan(startedAt);
		expect(completedAt).toBeGreaterThan(bindAt);
		expect(reviewAt).toBeGreaterThan(completedAt);
	});

	it("Turn 失败时 Task 进入 failed 终态", async () => {
		const { repository, session } = await createHarness(new FailingTurnEngine());
		await recordPlanningTask(session);
		const result = await session.sendRequest(inputRequest("跑一下"), {}, passthroughPreparer);
		expect(result.status).toBe("failed");

		const tasks = taskSnapshots(await repository.load(identity.rootSessionId));
		expect(tasks[0].status).toBe("failed");
	});

	it("重启后事件重放恢复 Task 快照，且不破坏 Turn 恢复协议", async () => {
		const { repository, session } = await createHarness();
		await recordPlanningTask(session);
		await session.sendRequest(inputRequest("总结"), {}, passthroughPreparer);
		const conversation = await repository.load(identity.rootSessionId);
		expect(taskSnapshots(conversation)[0].status).toBe("awaiting_review");

		// 模拟重启：同一持久化事件流上重建 Session（恢复策略必须接受 Task 事实）。
		const eventSink = new CollectingEventSink();
		const pipeline = new TurnPipeline({
			repository,
			snapshotProvider: new StaticRuntimeSnapshotProvider(snapshot()),
			turnEngine: new CompletingTurnEngine(),
			eventSink,
			clock: new TestClock(),
			idGenerator: new TestIdGenerator(),
		});
		const resumed = await resumeAgentSession({ id: identity.rootSessionId, pipeline });
		expect(resumed.state).toBe("idle");
	});

	it("暂停的 Task 在下一次 Turn 自动恢复并绑定新 Turn", async () => {
		const { repository, session } = await createHarness();

		// 宿主预先提交一个已暂停的 Task：created → plan → start(turn-0) → pause。
		const initial = createRuntimeTaskSnapshot({ identity, title: "暂停的任务", at: 100 });
		const created: RuntimeTaskEvent = {
			schemaVersion: 1,
			taskId: identity.taskId,
			eventId: "task-1:created",
			at: 100,
			type: "task.created",
			snapshot: initial,
		};
		const planned = transitionRuntimeTask(initial, {
			eventId: "task-1:plan",
			at: 101,
			intent: { type: "plan" },
		});
		const started = transitionRuntimeTask(planned.snapshot, {
			eventId: "task-1:start",
			at: 102,
			intent: { type: "start", turnId: "turn-0" },
		});
		const paused = transitionRuntimeTask(started.snapshot, {
			eventId: "task-1:pause",
			at: 103,
			intent: { type: "pause" },
		});
		await session.recordTaskFacts(
			[created, ...planned.events, ...started.events, ...paused.events].map((task) => ({
				type: "task.lifecycle.recorded" as const,
				sessionId: identity.rootSessionId,
				task,
				timestamp: task.at,
			})),
		);

		await session.sendRequest(inputRequest("继续这个任务"), {}, passthroughPreparer);
		const finalTasks = taskSnapshots(await repository.load(identity.rootSessionId));
		expect(finalTasks[0].status).toBe("awaiting_review");
		expect(finalTasks[0].activeTurnId).toBe("turn-1");
	});
});
