// Copyright The Open Forge contributors.
import type { AssistantMessage, UserMessage } from "@vetta/ai";
import { describe, expect, it, vi } from "vitest";
import {
	type Clock,
	type ContextStrategy,
	type ConversationMetadata,
	type ConversationRepository,
	type ConversationSnapshot,
	type CreateConversationInput,
	createAgentSession,
	type EventSink,
	type IdGenerator,
	KERNEL_ERROR_CODES,
	type KernelEvent,
	type PreparedContext,
	type RuntimeInputRequestPreparer,
	type RuntimeSnapshot,
	type RuntimeSnapshotAcquireContext,
	type RuntimeSnapshotLease,
	type RuntimeSnapshotProvider,
	resumeAgentSession,
	type SessionInputRequest,
	StaticRuntimeSnapshotProvider,
	type StoredConversation,
	type StoredSessionEvent,
	type TurnEngineEvent,
	type TurnEnginePort,
	type TurnEngineRequest,
	TurnPipeline,
} from "../../src/kernel/index.js";

const CANCEL_DEADLINE_MS = 30;

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
		if (this.conversations.has(input.sessionId)) {
			throw new Error(`Conversation already exists: ${input.sessionId}`);
		}
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
		if (conversation.version !== expectedVersion) {
			throw new Error(`Version mismatch: expected ${expectedVersion}, received ${conversation.version}`);
		}
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

	async saveSnapshot(_sessionId: string, _snapshot: ConversationSnapshot): Promise<void> {}

	async close(): Promise<void> {}
}

class RecordingContextStrategy implements ContextStrategy {
	async prepare(input: Parameters<ContextStrategy["prepare"]>[0], signal: AbortSignal): Promise<PreparedContext> {
		signal.throwIfAborted();
		return { messages: input.messages, estimatedTokens: input.messages.length };
	}
}

/**
 * 忽略 AbortSignal 的 TurnEngine：模拟不响应取消的 Provider/Tool/Compaction。
 * execute 挂起到显式 release()，之后才继续产生事件——这让测试可以观察
 * 「取消宽限到期」与「僵尸 Turn 晚结算」两个时序。
 */
class IgnoringAbortTurnEngine implements TurnEnginePort {
	readonly requests: TurnEngineRequest[] = [];
	private gate = deferred<void>();
	private released = false;

	async *execute(request: TurnEngineRequest): AsyncIterable<TurnEngineEvent> {
		this.requests.push(request);
		yield {
			type: "observation",
			observation: { type: "message.delta", delta: "partial", source: "agent" },
		};
		await this.gate.promise;
		yield { type: "message", message: assistantMessage("late output") };
		yield { type: "completed", stopReason: "stop" };
	}

	release(): void {
		if (this.released) return;
		this.released = true;
		this.gate.resolve();
	}
}

/** 遵守 AbortSignal 的 TurnEngine：挂起到 release 或 abort。 */
class AbortHonoringTurnEngine implements TurnEnginePort {
	readonly requests: TurnEngineRequest[] = [];
	private gate = deferred<void>();

	async *execute(request: TurnEngineRequest): AsyncIterable<TurnEngineEvent> {
		this.requests.push(request);
		yield {
			type: "observation",
			observation: { type: "message.delta", delta: "partial", source: "agent" },
		};
		await this.gate.promise;
		request.signal.throwIfAborted();
		yield { type: "message", message: assistantMessage("done") };
		yield { type: "completed", stopReason: "stop" };
	}

	release(): void {
		this.gate.resolve();
	}
}

function snapshot(contextStrategy: ContextStrategy): RuntimeSnapshot {
	return {
		id: "snapshot-1",
		instructions: [],
		tools: new Map(),
		contextProviders: [],
		contextStrategy,
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

/** 统计 release 调用次数的 SnapshotProvider：资源必须恰好释放一次。 */
class CountingSnapshotProvider implements RuntimeSnapshotProvider {
	releaseCount = 0;
	private readonly inner = new StaticRuntimeSnapshotProvider(snapshot(new RecordingContextStrategy()));

	async acquire(context: RuntimeSnapshotAcquireContext): Promise<RuntimeSnapshotLease> {
		const lease = await this.inner.acquire(context);
		return {
			snapshot: lease.snapshot,
			...(lease.modelBinding ? { modelBinding: lease.modelBinding } : {}),
			release: async () => {
				this.releaseCount += 1;
				await lease.release();
			},
		};
	}
}

type ControllableTurnEngine = IgnoringAbortTurnEngine | AbortHonoringTurnEngine;

async function createHarness(options?: {
	readonly turnEngine?: ControllableTurnEngine;
	readonly cancelDeadlineMs?: number;
	readonly onCancelDeadlineExceeded?: (info: { readonly reason?: string; readonly deadlineMs: number }) => void;
	readonly snapshotProvider?: RuntimeSnapshotProvider;
}) {
	const repository = new InMemoryConversationRepository();
	const eventSink = new CollectingEventSink();
	const turnEngine: ControllableTurnEngine = options?.turnEngine ?? new IgnoringAbortTurnEngine();
	const pipeline = new TurnPipeline({
		repository,
		snapshotProvider:
			options?.snapshotProvider ?? new StaticRuntimeSnapshotProvider(snapshot(new RecordingContextStrategy())),
		turnEngine,
		eventSink,
		clock: new TestClock(),
		idGenerator: new TestIdGenerator(),
	});
	const session = await createAgentSession({
		id: "session-1",
		pipeline,
		cancelDeadlineMs: options?.cancelDeadlineMs ?? CANCEL_DEADLINE_MS,
		onCancelDeadlineExceeded: options?.onCancelDeadlineExceeded,
	});
	return { repository, eventSink, turnEngine, pipeline, session };
}

/** 等待 Session 状态到达目标值；比固定 sleep 更可靠的显式同步点。 */
async function waitForState(session: { readonly state: string }, expected: string): Promise<void> {
	await vi.waitFor(() => expect(session.state).toBe(expected));
}

function terminalEvents(conversation: StoredConversation, turnId: string): StoredSessionEvent[] {
	return conversation.events.filter(
		(event) =>
			event.turnId === turnId &&
			(event.type === "turn.completed" ||
				event.type === "turn.cancelled" ||
				event.type === "turn.failed" ||
				event.type === "turn.transferred"),
	);
}

function userMessage(text: string): UserMessage {
	return { role: "user", content: text, timestamp: 1 };
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

function inputRequest(text: string): SessionInputRequest {
	return { payload: { text }, displayText: text };
}

const passthroughPreparer: RuntimeInputRequestPreparer = {
	async prepare(request) {
		return { action: "continue", input: { message: userMessage(request.displayText) } };
	},
};

function deferred<T = void>(): { readonly promise: Promise<T>; resolve(value: T | PromiseLike<T>): void } {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe("AgentSession cancel deadline", () => {
	it("忽略 AbortSignal 的 Turn 在宽限到期后进入 recovery_required，cancel 有界返回", async () => {
		const deadlineExceeded = vi.fn();
		const { session, repository, turnEngine } = await createHarness({ onCancelDeadlineExceeded: deadlineExceeded });
		const sending = session.send({ message: userMessage("hello") });
		await vi.waitFor(() => expect(turnEngine.requests.length).toBe(1));

		await session.cancel("user stopped");

		expect(session.state).toBe("recovery_required");
		expect(deadlineExceeded).toHaveBeenCalledTimes(1);
		expect(deadlineExceeded.mock.calls[0]?.[0]).toMatchObject({
			reason: "user stopped",
			deadlineMs: CANCEL_DEADLINE_MS,
		});
		await expect(session.send({ message: userMessage("again") })).rejects.toMatchObject({
			code: KERNEL_ERROR_CODES.TURN_PERSISTENCE,
		});

		// 僵尸 Turn 晚结算：终态事件恰好落盘一次，Session 保持已收敛状态。
		(turnEngine as IgnoringAbortTurnEngine).release();
		await sending;
		expect(session.state).toBe("recovery_required");
		const conversation = await repository.load("session-1");
		expect(terminalEvents(conversation, "turn-1")).toHaveLength(1);
		expect(terminalEvents(conversation, "turn-1")[0]?.type).toBe("turn.cancelled");
	});

	it("sendRequestWhenAvailable 的等待者在宽限到期时被释放并以 turn_persistence 拒绝", async () => {
		const { session } = await createHarness();
		// 引擎忽略 abort，首个 Turn 永远悬挂。
		void session.sendRequest(inputRequest("first"), {}, passthroughPreparer);
		await vi.waitFor(() => expect(session.state).toBe("running"));

		const waiting = session.sendRequestWhenAvailable(inputRequest("second"), passthroughPreparer);
		const waiterRejected = expect(waiting).rejects.toMatchObject({
			code: KERNEL_ERROR_CODES.TURN_PERSISTENCE,
		});
		await session.cancel("stop");

		await waiterRejected;
		await expect(session.send({ message: userMessage("x") })).rejects.toMatchObject({
			code: KERNEL_ERROR_CODES.TURN_PERSISTENCE,
		});
	});

	it("重复 cancel 幂等：不重置 deadline、不重复触发通知", async () => {
		const deadlineExceeded = vi.fn();
		const { session, turnEngine } = await createHarness({ onCancelDeadlineExceeded: deadlineExceeded });
		void session.send({ message: userMessage("hello") });
		await vi.waitFor(() => expect(turnEngine.requests.length).toBe(1));

		await Promise.all([session.cancel("first stop"), session.cancel("second stop")]);

		expect(session.state).toBe("recovery_required");
		expect(deadlineExceeded).toHaveBeenCalledTimes(1);
		expect(deadlineExceeded.mock.calls[0]?.[0].reason).toBe("first stop");
	});

	it("waitMs 先返回，Session 仍在 deadline 收敛到 recovery_required", async () => {
		const deadlineExceeded = vi.fn();
		const { session, turnEngine } = await createHarness({
			cancelDeadlineMs: 80,
			onCancelDeadlineExceeded: deadlineExceeded,
		});
		void session.send({ message: userMessage("hello") });
		await vi.waitFor(() => expect(turnEngine.requests.length).toBe(1));

		await session.cancel("user stopped", { waitMs: 5 });
		expect(session.state).toBe("cancelling");
		expect(deadlineExceeded).not.toHaveBeenCalled();

		await waitForState(session, "recovery_required");
		expect(deadlineExceeded).toHaveBeenCalledTimes(1);
	});

	it("close() 对不响应取消的 Turn 有界收敛到 closed，晚结算不复活状态", async () => {
		const snapshotProvider = new CountingSnapshotProvider();
		const { session, turnEngine } = await createHarness({ snapshotProvider });
		const sending = session.send({ message: userMessage("hello") });
		await vi.waitFor(() => expect(turnEngine.requests.length).toBe(1));

		await session.close();
		expect(session.state).toBe("closed");

		(turnEngine as IgnoringAbortTurnEngine).release();
		await sending;
		// 回归：Turn 结算不得把已关闭的 Session 回跳成 idle，也不得重启排队工作。
		expect(session.state).toBe("closed");
		expect(snapshotProvider.releaseCount).toBe(1);
	});

	it("取消宽限到期后 resume：未闭合 Turn 标记为 interrupted，僵尸终态被幂等吸收", async () => {
		const { session, repository, pipeline, turnEngine } = await createHarness();
		const sending = session.send({ message: userMessage("hello") });
		await vi.waitFor(() => expect(turnEngine.requests.length).toBe(1));
		await session.cancel("user stopped");
		expect(session.state).toBe("recovery_required");

		const resumed = await resumeAgentSession({ id: "session-1", pipeline });
		let conversation = await repository.load("session-1");
		const interrupted = terminalEvents(conversation, "turn-1");
		expect(interrupted).toHaveLength(1);
		expect(interrupted[0]).toMatchObject({
			type: "turn.failed",
			error: { code: KERNEL_ERROR_CODES.TURN_INTERRUPTED },
		});

		// 僵尸 Turn 晚结算：它的 turn.cancelled 被 existingTerminal 防护吸收，
		// 持久化终态保持恰好一个。
		(turnEngine as IgnoringAbortTurnEngine).release();
		await sending;
		conversation = await repository.load("session-1");
		expect(terminalEvents(conversation, "turn-1")).toHaveLength(1);

		// 恢复后的 Session 可以正常开始新 Turn（引擎 gate 已放行，execute 直通完成）。
		const result = await resumed.send({ message: userMessage("after resume") });
		expect(result.status).toBe("completed");
		expect(resumed.state).toBe("idle");
	});

	it("遵守 AbortSignal 的 Turn 在宽限内正常取消，不触发升级", async () => {
		const deadlineExceeded = vi.fn();
		const turnEngine = new AbortHonoringTurnEngine();
		const { session } = await createHarness({ turnEngine, onCancelDeadlineExceeded: deadlineExceeded });
		const sending = session.send({ message: userMessage("hello") });
		await vi.waitFor(() => expect(session.state).toBe("running"));

		turnEngine.release();
		await session.cancel("user stopped");
		const result = await sending;

		expect(result.status).toBe("cancelled");
		expect(session.state).toBe("idle");
		expect(deadlineExceeded).not.toHaveBeenCalled();
	});

	it("忽略 AbortSignal 的队列操作同样受取消宽限约束", async () => {
		const deadlineExceeded = vi.fn();
		const operationGate = deferred();
		const operationSignals: AbortSignal[] = [];
		const repository = new InMemoryConversationRepository();
		const pipeline = new TurnPipeline({
			repository,
			snapshotProvider: new StaticRuntimeSnapshotProvider(snapshot(new RecordingContextStrategy())),
			turnEngine: new IgnoringAbortTurnEngine(),
			eventSink: new CollectingEventSink(),
			clock: new TestClock(),
			idGenerator: new TestIdGenerator(),
		});
		const session = await createAgentSession({
			id: "session-op",
			pipeline,
			cancelDeadlineMs: CANCEL_DEADLINE_MS,
			onCancelDeadlineExceeded: deadlineExceeded,
			// Compaction 等队列操作不响应取消：收到 signal 后仍然挂起。
			onQueueOperation: async (_operation, signal) => {
				operationSignals.push(signal);
				await operationGate.promise;
			},
		});

		session.queueOperation({ type: "context.compact" });
		await vi.waitFor(() => expect(operationSignals.length).toBe(1));
		expect(session.state).toBe("running");

		await session.cancel("user stopped compaction");
		expect(session.state).toBe("recovery_required");
		expect(deadlineExceeded).toHaveBeenCalledTimes(1);
		expect(operationSignals[0]?.aborted).toBe(true);

		// 晚结算：不重启排队工作、不翻转终态。
		operationGate.resolve();
		await vi.waitFor(() => {
			// work promise 的 finally 已跑完 finishActiveTurn。
			expect(session.state).toBe("recovery_required");
		});
		expect(deadlineExceeded).toHaveBeenCalledTimes(1);
	});

	it("sendQueuedNow 在 Session 收敛后回滚取出的条目而不是静默开新 Turn", async () => {
		const { session, turnEngine } = await createHarness();
		void session.send({ message: userMessage("working") });
		await vi.waitFor(() => expect(turnEngine.requests.length).toBe(1));

		await session.send({ message: userMessage("queued follow-up") }, { streamingBehavior: "followUp" });
		const queuedEntry = session.listQueue().entries.find((entry) => entry.input.message !== undefined);
		expect(queuedEntry).toBeDefined();
		if (!queuedEntry) throw new Error("queued entry missing");

		await expect(session.sendQueuedNow(queuedEntry.id)).rejects.toMatchObject({
			code: KERNEL_ERROR_CODES.TURN_PERSISTENCE,
		});
		expect(session.state).toBe("recovery_required");
		expect(turnEngine.requests.length).toBe(1);

		// 取出的消息回到队列，供恢复后继续消费。
		const restored = session.listQueue().entries.filter((entry) => entry.input.message !== undefined);
		expect(restored).toHaveLength(1);
	});
});

describe("AgentSession cancel deadline on sessions without activity", () => {
	it("无活动 Turn 时 cancel 立即返回且不触发 deadline", async () => {
		const deadlineExceeded = vi.fn();
		const { session } = await createHarness({ onCancelDeadlineExceeded: deadlineExceeded });
		await session.cancel("no work");
		expect(session.state).toBe("idle");
		expect(deadlineExceeded).not.toHaveBeenCalled();
	});

	it("cancelDeadlineMs 非有限值退回无限等待语义", async () => {
		const deadlineExceeded = vi.fn();
		const { session, turnEngine } = await createHarness({
			cancelDeadlineMs: Number.POSITIVE_INFINITY,
			onCancelDeadlineExceeded: deadlineExceeded,
		});
		const sending = session.send({ message: userMessage("hello") });
		await vi.waitFor(() => expect(turnEngine.requests.length).toBe(1));

		const cancelling = session.cancel("stop", { waitMs: 5 });
		await cancelling;
		expect(session.state).toBe("cancelling");
		expect(deadlineExceeded).not.toHaveBeenCalled();

		(turnEngine as IgnoringAbortTurnEngine).release();
		const result = await sending;
		expect(result.status).toBe("cancelled");
		expect(session.state).toBe("idle");
	});
});
