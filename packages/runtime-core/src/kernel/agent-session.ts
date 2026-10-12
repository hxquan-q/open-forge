// Modified by The Open Forge contributors.
import type {
	AgentSessionState,
	QueuedSessionInput,
	QueuedSessionInputResult,
	QueueSessionInputIfRunningResult,
	RuntimeInputRequestPreparer,
	RuntimeSessionFactEvent,
	SessionContextRecord,
	SessionInput,
	SessionInputQueueMode,
	SessionInputRequest,
	SessionQueueOperation,
	SessionSendOptions,
	SessionSendResult,
	SessionStreamingBehavior,
	TurnResult,
	TurnSessionIdentity,
} from "./contracts.js";
import {
	KERNEL_ERROR_CODES,
	KernelError,
	sessionBusyError,
	sessionClosedError,
	turnPersistenceError,
} from "./errors.js";
import { type ClearedSessionInputs, SessionInputQueue, type SessionInputQueueSnapshot } from "./session-input-queue.js";
import type { TurnPipeline } from "./turn-pipeline.js";

/**
 * 取消宽限到期时交给宿主的信息：用于把 Session 收敛结果投影给用户（错误事件、
 * 日志或恢复入口），kernel 自身不决定呈现方式。
 */
export interface SessionCancelDeadlineInfo {
	readonly reason?: string;
	readonly deadlineMs: number;
}

/**
 * 取消请求发出后，Session 等待活动 Turn 安全结算的宽限时间。一个忽略 AbortSignal
 * 的 Provider/Tool/Compaction 不能让 Session 永远停在 `cancelling`：到期后 Session
 * 收敛到 `recovery_required`（关闭路径收敛到 `closed`），由恢复流程重建会话。
 * 传入非有限值（如 `Infinity`）可退回无限等待的旧行为。
 */
export const DEFAULT_CANCEL_DEADLINE_MS = 10_000;

export interface CreateAgentSessionOptions {
	readonly id: string;
	readonly pipeline: TurnPipeline;
	readonly agentId?: string;
	readonly cwd?: string;
	readonly steeringMode?: SessionInputQueueMode;
	readonly followUpMode?: SessionInputQueueMode;
	/** 取消宽限（毫秒）；到期未结算的活动 Turn 使 Session 进入明确终态。 */
	readonly cancelDeadlineMs?: number;
	/** 取消宽限到期的通知；每个「取消纪元」至多触发一次。 */
	readonly onCancelDeadlineExceeded?: (info: SessionCancelDeadlineInfo) => void;
	/** 输入队列任何可观察变化后的同步回调；宿主用于镜像广播与持久化（ADR-0060）。 */
	readonly onQueueChange?: (snapshot: SessionInputQueueSnapshot) => void;
	/** 执行排到 follow-up 队首的宿主操作；操作不进入 Turn/模型消息。 */
	readonly onQueueOperation?: (operation: SessionQueueOperation, signal: AbortSignal) => Promise<void>;
	readonly onQueueOperationError?: (operation: SessionQueueOperation, error: unknown) => Promise<void> | void;
}

export class AgentSession {
	private readonly identity: MutableTurnSessionIdentity;
	private readonly pipeline: TurnPipeline;
	private readonly inputQueue: SessionInputQueue;
	private readonly onQueueOperation: CreateAgentSessionOptions["onQueueOperation"];
	private readonly onQueueOperationError: CreateAgentSessionOptions["onQueueOperationError"];
	private readonly cancelDeadlineMs: number;
	private readonly onCancelDeadlineExceeded: CreateAgentSessionOptions["onCancelDeadlineExceeded"];
	private currentState: AgentSessionState = "idle";
	private activeController: AbortController | undefined;
	private activeTurn: Promise<SessionSendResult> | undefined;
	/**
	 * 与 `activeTurn` 同生共灭的释放屏障：Turn 结算或取消宽限到期都会放行等待者，
	 * 使 cancel/close/sendRequestWhenAvailable 在忽略 abort 的执行上仍然有界。
	 */
	private activeTurnRelease: { readonly promise: Promise<void>; resolve(): void } | undefined;
	private cancelDeadlineTimer: ReturnType<typeof setTimeout> | undefined;
	private cancelReason: string | undefined;
	private activeQueueOperation: { readonly id: string; readonly operation: SessionQueueOperation } | undefined;
	private continuationRequested = false;
	private continuationDrain: Promise<void> | undefined;
	/** 进入 `recovery_required` 的首个持久化原因；后续拒绝路径透传它，而不是裸模板错误。 */
	private persistenceError: KernelError | undefined;
	private recoveryDrain: Promise<void> | undefined;
	private inputRequestPreparer: RuntimeInputRequestPreparer | undefined;
	private readonly continuationContext: SessionContextRecord[] = [];
	private readonly nextTurnContext: SessionContextRecord[] = [];
	private contextWrite: Promise<void> = Promise.resolve();
	private readonly continuationWaiters: Array<{
		resolve(): void;
		reject(error: unknown): void;
	}> = [];

	private constructor(options: CreateAgentSessionOptions) {
		this.identity = new MutableTurnSessionIdentity(options.id);
		this.pipeline = options.pipeline;
		this.inputQueue = new SessionInputQueue({
			steeringMode: options.steeringMode,
			followUpMode: options.followUpMode,
			onChange: options.onQueueChange,
		});
		this.onQueueOperation = options.onQueueOperation;
		this.onQueueOperationError = options.onQueueOperationError;
		this.cancelDeadlineMs = options.cancelDeadlineMs ?? DEFAULT_CANCEL_DEADLINE_MS;
		this.onCancelDeadlineExceeded = options.onCancelDeadlineExceeded;
	}

	static async create(options: CreateAgentSessionOptions): Promise<AgentSession> {
		const session = new AgentSession(options);
		await options.pipeline.createSession(options.id, options.cwd, options.agentId);
		return session;
	}

	static async resume(options: CreateAgentSessionOptions): Promise<AgentSession> {
		const session = new AgentSession(options);
		await options.pipeline.resumeSession(options.id);
		return session;
	}

	get state(): AgentSessionState {
		return this.currentState;
	}

	get id(): string {
		return this.identity.sessionId;
	}

	get pendingMessageCount(): number {
		return this.inputQueue.pendingCount;
	}

	getSteeringMessages(): readonly SessionInput["message"][] {
		return this.inputQueue.steeringInputs.flatMap((input) => (input.message ? [input.message] : []));
	}

	getFollowUpMessages(): readonly SessionInput["message"][] {
		return this.inputQueue.followUpInputs.flatMap((input) => (input.message ? [input.message] : []));
	}

	get steeringMode(): SessionInputQueueMode {
		return this.inputQueue.steeringMode;
	}

	get followUpMode(): SessionInputQueueMode {
		return this.inputQueue.followUpMode;
	}

	setSteeringMode(mode: SessionInputQueueMode): void {
		this.inputQueue.setSteeringMode(mode);
	}

	setFollowUpMode(mode: SessionInputQueueMode): void {
		this.inputQueue.setFollowUpMode(mode);
	}

	async send(input: SessionInput): Promise<TurnResult>;
	async send(input: SessionInput, options: SessionSendOptions): Promise<SessionSendResult>;
	async send(input: SessionInput, options: SessionSendOptions = {}): Promise<SessionSendResult> {
		await this.contextWrite;
		if (this.currentState === "closed" || this.currentState === "closing") {
			throw sessionClosedError();
		}
		await this.recoverIfRequired();
		if (this.currentState === "recovery_required") throw this.persistenceRequiredError();
		if (this.currentState !== "idle") {
			if (!options.streamingBehavior) throw sessionBusyError();
			return this.queueInput(options.streamingBehavior, input);
		}

		const trailingContext = [...(input.trailingContext ?? []), ...this.nextTurnContext.splice(0)];
		return this.startTurn(trailingContext.length > 0 ? { ...input, trailingContext } : input);
	}

	async sendRequest(
		request: SessionInputRequest,
		options: SessionSendOptions = {},
		preparer?: RuntimeInputRequestPreparer,
	): Promise<SessionSendResult> {
		await this.contextWrite;
		if (preparer) this.inputRequestPreparer = preparer;
		if (this.currentState === "closed" || this.currentState === "closing") throw sessionClosedError();
		await this.recoverIfRequired();
		if (this.currentState === "recovery_required") throw this.persistenceRequiredError();
		if (this.currentState !== "idle") {
			if (!options.streamingBehavior) throw sessionBusyError();
			const behavior = this.queueBehaviorAfterOperations(options.streamingBehavior);
			const { id, pendingCount } = this.inputQueue.enqueueRequestWithId(behavior, request);
			return { status: "queued", behavior, pendingCount, id };
		}
		return this.startRequest(request, preparer ?? this.inputRequestPreparer);
	}

	/**
	 * Waits behind the actual active Turn instead of treating a transient busy state
	 * as a failed request. Admission remains owned by this Session: once the previous
	 * Turn releases, the state check and start happen without an intervening await.
	 *
	 * An abort while waiting only cancels this request. After admission, the same
	 * signal owns and cancels the newly-started Turn.
	 */
	async sendRequestWhenAvailable(
		request: SessionInputRequest,
		preparer?: RuntimeInputRequestPreparer,
		signal?: AbortSignal,
	): Promise<SessionSendResult> {
		if (preparer) this.inputRequestPreparer = preparer;
		while (true) {
			await this.contextWrite;
			signal?.throwIfAborted();
			if (this.currentState === "closed" || this.currentState === "closing") throw sessionClosedError();
			await this.recoverIfRequired();
			if (this.currentState === "recovery_required") throw this.persistenceRequiredError();
			if (this.currentState === "idle") {
				return this.startRequest(request, preparer ?? this.inputRequestPreparer, signal);
			}
			const activeTurn = this.activeTurn;
			if (!activeTurn) {
				await Promise.resolve();
				continue;
			}
			await waitForTurnRelease(activeTurn, signal, this.activeTurnRelease?.promise);
		}
	}

	/**
	 * 原子地把输入加入正在运行的 Turn；空闲时不启动新 Turn。
	 * 宿主据此可在返回 idle 后走自己的正常 admission，避免先读状态再 prompt 的竞态。
	 */
	async queueRequestIfRunning(
		request: SessionInputRequest,
		behavior: SessionStreamingBehavior,
		preparer?: RuntimeInputRequestPreparer,
	): Promise<QueueSessionInputIfRunningResult> {
		await this.contextWrite;
		if (preparer) this.inputRequestPreparer = preparer;
		if (this.currentState === "closed" || this.currentState === "closing") throw sessionClosedError();
		await this.recoverIfRequired();
		if (this.currentState === "recovery_required") throw this.persistenceRequiredError();
		if (this.currentState === "idle") return { status: "idle" };
		const queuedBehavior = this.queueBehaviorAfterOperations(behavior);
		const { id, pendingCount } = this.inputQueue.enqueueRequestWithId(queuedBehavior, request);
		return { status: "queued", behavior: queuedBehavior, pendingCount, id };
	}

	async continue(): Promise<TurnResult> {
		await this.contextWrite;
		if (this.currentState === "closed" || this.currentState === "closing") {
			throw sessionClosedError();
		}
		await this.recoverIfRequired();
		if (this.currentState === "recovery_required") throw this.persistenceRequiredError();
		if (this.currentState !== "idle") throw sessionBusyError();
		return this.startTurn();
	}

	async retry(): Promise<TurnResult> {
		await this.contextWrite;
		if (this.currentState === "closed" || this.currentState === "closing") {
			throw sessionClosedError();
		}
		await this.recoverIfRequired();
		if (this.currentState === "recovery_required") throw this.persistenceRequiredError();
		if (this.currentState !== "idle") throw sessionBusyError();
		return this.startTurn(undefined, [], true);
	}

	/**
	 * 请求一次异步续跑。
	 *
	 * 与显式 continue 不同：活动 Turn 期间到达的多个请求会合并，并在当前 Turn
	 * 完成后串行启动一次 continuation。后台任务和子代理通知使用该入口唤醒
	 * 空闲 Session，避免绕过 Session 的并发状态机。
	 */
	requestContinuation(context: readonly SessionContextRecord[] = []): Promise<void> {
		if (this.currentState === "closed" || this.currentState === "closing") {
			return Promise.reject(sessionClosedError());
		}
		if (this.currentState === "cancelling") {
			return Promise.reject(continuationCancelledError());
		}
		// 同步入口：latch 必须在调用时完成（取消要先拒绝已登记 waiter），不能先
		// await 恢复再登记；恢复由异步 admission 入口承担，成功后自动排空续跑队列。
		if (this.currentState === "recovery_required") return Promise.reject(this.persistenceRequiredError());
		this.continuationRequested = true;
		this.continuationContext.push(...context);
		const completion = new Promise<void>((resolve, reject) => {
			this.continuationWaiters.push({ resolve, reject });
		});
		this.scheduleRequestedContinuations();
		return completion;
	}

	steer(input: SessionInput): QueuedSessionInputResult {
		return this.queueInput("steer", input);
	}

	followUp(input: SessionInput): QueuedSessionInputResult {
		return this.queueInput("followUp", input);
	}

	queueContext(
		behavior: SessionStreamingBehavior,
		context: readonly SessionContextRecord[],
	): QueuedSessionInputResult {
		if (this.currentState === "closed" || this.currentState === "closing") {
			throw sessionClosedError();
		}
		if (this.currentState === "recovery_required") throw this.persistenceRequiredError();
		const queuedBehavior = this.queueBehaviorAfterOperations(behavior);
		return {
			status: "queued",
			behavior: queuedBehavior,
			pendingCount: this.inputQueue.enqueueContext(queuedBehavior, context),
		};
	}

	queueOperation(operation: SessionQueueOperation): QueuedSessionInputResult {
		if (this.currentState === "closed" || this.currentState === "closing") {
			throw sessionClosedError();
		}
		if (this.currentState === "recovery_required") throw this.persistenceRequiredError();
		if (this.activeQueueOperation?.operation.type === operation.type) {
			return {
				status: "queued",
				behavior: "followUp",
				pendingCount: this.inputQueue.pendingCount + 1,
				id: this.activeQueueOperation.id,
			};
		}
		const { id, pendingCount } = this.inputQueue.enqueueOperationWithId(operation);
		this.startQueuedOperationIfHead();
		return { status: "queued", behavior: "followUp", pendingCount, id };
	}

	queueNextTurnContext(context: readonly SessionContextRecord[]): void {
		if (this.currentState === "closed" || this.currentState === "closing") {
			throw sessionClosedError();
		}
		if (this.currentState === "recovery_required") throw this.persistenceRequiredError();
		this.nextTurnContext.push(...context);
	}

	recordContext(context: readonly SessionContextRecord[]): Promise<void> {
		if (this.currentState === "closed" || this.currentState === "closing") {
			return Promise.reject(sessionClosedError());
		}
		if (this.currentState === "recovery_required") return Promise.reject(this.persistenceRequiredError());
		const write = this.contextWrite.then(async () => {
			if (this.currentState !== "idle") throw sessionBusyError();
			await this.pipeline.recordContext(this.identity, context);
		});
		this.contextWrite = write.catch(() => undefined);
		return write;
	}

	/** 追加宿主显式提交的 Task/Artifact 事实；与 `recordContext` 同一串行与 idle 约束。 */
	recordTaskFacts(facts: readonly RuntimeSessionFactEvent[]): Promise<void> {
		if (this.currentState === "closed" || this.currentState === "closing") {
			return Promise.reject(sessionClosedError());
		}
		if (this.currentState === "recovery_required") return Promise.reject(this.persistenceRequiredError());
		const write = this.contextWrite.then(async () => {
			if (this.currentState !== "idle") throw sessionBusyError();
			await this.pipeline.recordTaskFacts(this.identity, facts);
		});
		this.contextWrite = write.catch(() => undefined);
		return write;
	}

	clearQueue(): ClearedSessionInputs {
		return this.inputQueue.clear();
	}

	listQueue(): SessionInputQueueSnapshot {
		return this.inputQueue.list();
	}

	removeQueued(id: string): boolean {
		return this.inputQueue.remove(id);
	}

	reorderQueuedFollowUps(ids: readonly string[]): void {
		this.inputQueue.reorderFollowUps(ids);
	}

	/** 「立即发送」的 streaming 形态：followUp 条目提升为 steering，工具间隙注入当前 turn。 */
	promoteQueuedToSteering(id: string): boolean {
		return this.inputQueue.promoteToSteering(id);
	}

	restoreQueue(snapshot: SessionInputQueueSnapshot): void {
		this.inputQueue.restore(snapshot);
		this.startQueuedOperationIfHead();
	}

	/**
	 * 「立即发送」某条排队消息：running 时**打断当前 turn**、以该条目立刻开启新 turn
	 * （在 kernel 内原子完成 take → cancel → start，没有渲染端等待/超时竞态）；
	 * 空闲时直接开启新 turn。其余排队条目保留并保持可消费（用户显式要继续，
	 * 不落入 pause-on-terminal）。
	 */
	async sendQueuedNow(
		id: string,
	): Promise<
		{ readonly status: "missing" } | { readonly status: "started"; readonly turn: Promise<SessionSendResult> }
	> {
		if (this.currentState === "closed" || this.currentState === "closing") {
			throw sessionClosedError();
		}
		await this.recoverIfRequired();
		if (this.currentState === "recovery_required") throw this.persistenceRequiredError();
		if (this.activeQueueOperation) return { status: "missing" };
		// 先取出条目再打断：确保这条消息绝不因中途失败而丢失在「已出队未发送」状态——
		// takeById 失败即早退，成功后它只存在于本调用栈，随 startTurn 进入持久化。
		const entry = this.inputQueue.takeById(id);
		if (!entry) return { status: "missing" };
		if (this.currentState !== "idle") {
			await this.cancel("send queued message now");
		}
		if (this.currentState !== "idle") {
			// 取消宽限到期或关闭路径已把 Session 收敛到终态：取出的条目放回队列尾部，
			// 不静默启动新 Turn，也不把消息丢在调用栈里。
			this.inputQueue.requeue(entry);
			throw sessionStateError(this.currentState);
		}
		await this.contextWrite;
		// cancel 的 pause-on-terminal 会冻结其余排队条目；用户点「立即发送」表达的
		// 是继续消费，解除暂停让它们在新 turn 的自然停止点接力。
		this.inputQueue.resume();
		return { status: "started", turn: this.startQueuedInput(entry.input) };
	}

	/**
	 * 解除 pause-on-terminal 并继续消费队列：空闲时以 followUp 队首开启新 turn，
	 * 其余条目由该 turn 的自然停止点接力消费；running 时仅解除暂停。
	 */
	async resumeQueue(): Promise<SessionSendResult | undefined> {
		if (this.currentState === "closed" || this.currentState === "closing") {
			throw sessionClosedError();
		}
		await this.recoverIfRequired();
		if (this.currentState === "recovery_required") throw this.persistenceRequiredError();
		this.inputQueue.resume();
		if (this.currentState !== "idle") return undefined;
		await this.contextWrite;
		// contextWrite 让出事件循环期间可能有别的 send 抢先起了 turn；重查状态，
		// 已在跑就把消费交给该 turn 的自然停止点。
		if (this.currentState !== "idle") return undefined;
		if (this.startQueuedOperationIfHead()) return undefined;
		const head = this.inputQueue.takeFollowUpHead();
		if (!head) return undefined;
		return this.startQueuedInput(head);
	}

	/**
	 * `waitMs` bounds how long the caller waits for the turn to unwind. Waiting matters:
	 * the session only returns to `idle` once the turn settles, and a caller that skips
	 * it leaves the next user input to be refused as busy or parked in the queue that the
	 * cancellation just froze. But a tool ignoring its AbortSignal must not be able to
	 * hold a user-initiated stop hostage either, so the wait is bounded, not skipped.
	 *
	 * Independently of `waitMs`, cancellation is armed with `cancelDeadlineMs`: a turn
	 * that still has not settled when the deadline expires pushes the Session to
	 * `recovery_required`, so omitting `waitMs` never waits forever.
	 */
	async cancel(reason?: string, options?: { readonly waitMs?: number }): Promise<void> {
		if (this.currentState !== "running" && this.currentState !== "cancelling") return;
		if (this.currentState !== "cancelling") this.cancelReason = reason;
		this.currentState = "cancelling";
		// A continuation queued behind the cancelled turn belongs to that turn's
		// background outcome. Letting it start after an explicit stop creates an
		// invisible new turn and can make the next user prompt collide with it.
		this.rejectContinuationWaiters(continuationCancelledError());
		this.activeController?.abort(reason);
		this.armCancelDeadline();
		const turn = this.activeTurn;
		if (!turn) return;
		const released = this.activeTurnRelease?.promise;
		const waiters: Promise<unknown>[] = [turn];
		if (released) waiters.push(released);
		if (options?.waitMs !== undefined) {
			waiters.push(waitTimeout(options.waitMs));
		}
		await Promise.race(waiters);
	}

	async close(): Promise<void> {
		if (this.currentState === "closed") return;
		if (!this.activeTurn) {
			await this.contextWrite;
			this.inputQueue.clear();
			this.nextTurnContext.length = 0;
			this.currentState = "closed";
			this.rejectContinuationWaiters(sessionClosedError());
			return;
		}

		this.currentState = "closing";
		this.activeController?.abort("Session closed");
		this.armCancelDeadline();
		// A turn ignoring its AbortSignal cannot hold teardown open: the release barrier
		// fires when the turn settles or when the cancel deadline forces `closed`.
		const released = this.activeTurnRelease?.promise;
		await Promise.race(released ? [this.activeTurn, released] : [this.activeTurn]);
		this.inputQueue.clear();
		this.nextTurnContext.length = 0;
		this.currentState = "closed";
		this.rejectContinuationWaiters(sessionClosedError());
	}

	private queueInput(behavior: SessionStreamingBehavior, input: SessionInput): QueuedSessionInputResult {
		if (this.currentState === "closed" || this.currentState === "closing") {
			throw sessionClosedError();
		}
		if (this.currentState === "recovery_required") throw this.persistenceRequiredError();
		const queuedBehavior = this.queueBehaviorAfterOperations(behavior);
		const { id, pendingCount } = this.inputQueue.enqueueWithId(queuedBehavior, input);
		return { status: "queued", behavior: queuedBehavior, pendingCount, id };
	}

	private queueBehaviorAfterOperations(behavior: SessionStreamingBehavior): SessionStreamingBehavior {
		return this.activeQueueOperation || this.inputQueue.hasOperation() ? "followUp" : behavior;
	}

	private async startTurn(
		input?: SessionInput,
		continuationContext: readonly SessionContextRecord[] = [],
		retrying = false,
	): Promise<TurnResult> {
		this.currentState = "running";
		const controller = new AbortController();
		this.activeController = controller;
		const turn = input
			? this.pipeline.run(this.identity, input, controller.signal, this.inputQueue)
			: retrying
				? this.pipeline.retry(this.identity, controller.signal, this.inputQueue)
				: this.pipeline.continue(this.identity, controller.signal, this.inputQueue, continuationContext);
		this.activeTurn = turn;
		this.activeTurnRelease = createDeferred();

		try {
			const result = await turn;
			// pause-on-terminal（ADR-0060）：aborted/failed 收尾时冻结残留队列，
			// 避免它们在下一个不相干的 turn 里被自然停止点突然消费。
			if (result.status !== "completed" && this.inputQueue.pendingCount > 0) {
				this.inputQueue.pause();
			}
			return result;
		} catch (error) {
			if (error instanceof KernelError && error.code === KERNEL_ERROR_CODES.TURN_PERSISTENCE) {
				this.persistenceError = error;
				this.currentState = "recovery_required";
			}
			if (this.inputQueue.pendingCount > 0) this.inputQueue.pause();
			throw error;
		} finally {
			this.finishActiveTurn();
		}
	}

	private async startRequest(
		request: SessionInputRequest,
		preparer?: RuntimeInputRequestPreparer,
		signal?: AbortSignal,
	): Promise<SessionSendResult> {
		signal?.throwIfAborted();
		this.currentState = "running";
		const controller = new AbortController();
		this.activeController = controller;
		const abort = () => {
			if (this.activeController !== controller) return;
			this.currentState = "cancelling";
			this.cancelReason = abortReasonText(signal?.reason);
			controller.abort(signal?.reason);
			// 与显式 cancel() 同一宽限：外部 signal 触发的取消同样不能无限等待。
			this.armCancelDeadline();
		};
		signal?.addEventListener("abort", abort, { once: true });
		if (signal?.aborted) abort();
		const turn = this.pipeline.runRequest(this.identity, request, controller.signal, this.inputQueue, preparer);
		this.activeTurn = turn;
		this.activeTurnRelease = createDeferred();
		try {
			const result = await turn;
			if (result.status !== "completed" && result.status !== "handled" && this.inputQueue.pendingCount > 0) {
				this.inputQueue.pause();
			}
			return result;
		} catch (error) {
			if (error instanceof KernelError && error.code === KERNEL_ERROR_CODES.TURN_PERSISTENCE) {
				this.persistenceError = error;
				this.currentState = "recovery_required";
			}
			if (this.inputQueue.pendingCount > 0) this.inputQueue.pause();
			throw error;
		} finally {
			signal?.removeEventListener("abort", abort);
			this.finishActiveTurn();
		}
	}

	private startQueuedInput(input: QueuedSessionInput): Promise<SessionSendResult> {
		if (input.request) return this.startRequest(input.request, this.inputRequestPreparer);
		if (input.message) return this.startTurn(input as SessionInput);
		throw new Error("Queued input does not contain a message or request");
	}

	private startQueuedOperation(entry: {
		readonly id: string;
		readonly operation: SessionQueueOperation;
	}): Promise<SessionSendResult> {
		this.currentState = "running";
		this.activeQueueOperation = entry;
		const controller = new AbortController();
		this.activeController = controller;
		this.activeTurnRelease = createDeferred();
		const work = (async (): Promise<SessionSendResult> => {
			try {
				if (!this.onQueueOperation) {
					throw new Error(`Queued operation is unavailable: ${entry.operation.type}`);
				}
				await this.onQueueOperation(entry.operation, controller.signal);
			} catch (error) {
				try {
					await this.onQueueOperationError?.(entry.operation, error);
				} catch (reportError) {
					console.warn("[runtime-core] failed to report queued operation error", reportError);
				}
			} finally {
				if (this.activeQueueOperation?.id === entry.id) this.activeQueueOperation = undefined;
				this.finishActiveTurn(true);
				this.scheduleQueueAfterOperation();
			}
			return { status: "handled", sessionId: this.id };
		})();
		this.activeTurn = work;
		return work;
	}

	private startQueuedOperationIfHead(): boolean {
		if (this.currentState !== "idle" || this.inputQueue.paused || !this.inputQueue.peekFollowUpOperation()) {
			return false;
		}
		const entry = this.inputQueue.takeFollowUpOperationHead();
		if (!entry) return false;
		void this.startQueuedOperation(entry);
		return true;
	}

	private scheduleQueueAfterOperation(): void {
		queueMicrotask(() => {
			if (this.currentState !== "idle" || this.inputQueue.paused) return;
			const entry = this.inputQueue.takeFollowUpOperationHead();
			if (entry) {
				void this.startQueuedOperation(entry);
				return;
			}
			const input = this.inputQueue.takeFollowUpHead();
			if (!input) {
				this.scheduleRequestedContinuations();
				return;
			}
			void this.startQueuedInput(input).catch((error) => {
				console.warn("[runtime-core] queued input after operation crashed", error);
			});
		});
	}

	private async drainRequestedContinuations(): Promise<void> {
		while (this.continuationRequested && this.currentState === "idle") {
			this.continuationRequested = false;
			const waiters = this.continuationWaiters.splice(0);
			const context = this.continuationContext.splice(0);
			try {
				await this.startTurn(undefined, context);
				for (const waiter of waiters) waiter.resolve();
			} catch (error) {
				for (const waiter of waiters) waiter.reject(error);
			}
		}
	}

	private finishActiveTurn(deferContinuations = false): void {
		this.activeController = undefined;
		this.activeTurn = undefined;
		if (this.cancelDeadlineTimer !== undefined) {
			clearTimeout(this.cancelDeadlineTimer);
			this.cancelDeadlineTimer = undefined;
		}
		this.cancelReason = undefined;
		this.activeTurnRelease?.resolve();
		this.activeTurnRelease = undefined;
		this.currentState =
			this.currentState === "closing" || this.currentState === "closed"
				? "closed"
				: this.currentState === "recovery_required"
					? "recovery_required"
					: "idle";
		const operationStarted = this.startQueuedOperationIfHead();
		if (!deferContinuations && !operationStarted) this.scheduleRequestedContinuations();
	}

	/**
	 * 武装取消宽限。只在「取消纪元」起点记录一次 reason；重复 cancel/close 不重置
	 * 截止时间，否则持续按停止键可以把 deadline 无限推迟。
	 */
	private armCancelDeadline(): void {
		if (this.cancelDeadlineTimer !== undefined) return;
		if (!Number.isFinite(this.cancelDeadlineMs) || this.cancelDeadlineMs < 0) return;
		const timer = setTimeout(() => this.expireCancelDeadline(), this.cancelDeadlineMs);
		// 宽限计时器不应阻止宿主进程退出；浏览器/测试环境的返回值没有 unref。
		if (typeof timer === "object" && timer !== null && "unref" in timer && typeof timer.unref === "function") {
			timer.unref();
		}
		this.cancelDeadlineTimer = timer;
	}

	/**
	 * 宽限到期：取消路径收敛到 `recovery_required`，关闭路径收敛到 `closed`。
	 * 不伪造终态事件——底层 Turn 仍在后台持有自己的持久化管线，它结算时写入的
	 * 终态事件由 appendTerminalEvent 的 existingTerminal 防护保证至多一个。
	 */
	private expireCancelDeadline(): void {
		this.cancelDeadlineTimer = undefined;
		if (!this.activeTurn) return;
		const reason = this.cancelReason;
		this.cancelReason = undefined;
		// 屏障 resolve 后保留引用：后续 cancel/close/waitForTurnRelease 必须立即放行，
		// 而不是重新挂到仍在悬挂的 Turn promise 上。引用由 finishActiveTurn 统一清理。
		if (this.currentState === "closing") {
			this.currentState = "closed";
			this.activeTurnRelease?.resolve();
			return;
		}
		if (this.currentState !== "cancelling") return;
		this.currentState = "recovery_required";
		// 与 pause-on-terminal 同语义：残留排队输入不渗入恢复后的第一个 Turn。
		this.inputQueue.pause();
		this.activeTurnRelease?.resolve();
		try {
			this.onCancelDeadlineExceeded?.({ reason, deadlineMs: this.cancelDeadlineMs });
		} catch (error) {
			console.warn("[runtime-core] failed to report cancel deadline", error);
		}
	}

	private scheduleRequestedContinuations(): void {
		if (!this.continuationRequested || this.continuationDrain) return;
		if (this.currentState === "closed" || this.currentState === "closing") {
			this.rejectContinuationWaiters(sessionClosedError());
			return;
		}
		if (this.currentState !== "idle") return;
		this.continuationDrain = this.drainRequestedContinuations();
		void this.continuationDrain.then(() => {
			this.continuationDrain = undefined;
			if (this.continuationRequested) this.scheduleRequestedContinuations();
		});
	}

	private rejectContinuationWaiters(error: unknown): void {
		this.continuationRequested = false;
		this.continuationContext.length = 0;
		for (const waiter of this.continuationWaiters.splice(0)) waiter.reject(error);
	}

	/**
	 * `recovery_required` 的入坞恢复：复用 `pipeline.resumeSession`——与宿主恢复
	 * 流程同一原语（重跑恢复策略、为未结算回合补 `turn.failed` 中断终态，幂等）。
	 * 成功后回 `idle`，调用方继续本次 admission；恢复失败保持 `recovery_required`
	 * 并把恢复失败记为新的首因。并发 admission 共享同一恢复 drain。
	 *
	 * 拒绝原地恢复的情形：`activeTurn` 仍悬挂（取消宽限收敛路径）——僵尸回合随时
	 * 可能回写终态，两条管线并发写同一会话日志会破坏事件序；该情形维持拒绝，
	 * 仍由宿主重建 Session（BUG-0091）。
	 */
	private recoverIfRequired(): Promise<void> {
		if (this.currentState !== "recovery_required") return Promise.resolve();
		this.recoveryDrain ??= (async () => {
			try {
				if (this.activeTurn) return;
				await this.pipeline.resumeSession(this.identity.sessionId);
				this.persistenceError = undefined;
				this.currentState = "idle";
				this.scheduleRequestedContinuations();
			} catch (error) {
				this.persistenceError = error instanceof KernelError ? error : turnPersistenceError(error);
			}
		})().finally(() => {
			this.recoveryDrain = undefined;
		});
		return this.recoveryDrain;
	}

	/** `recovery_required` 的拒绝路径透传首个持久化原因（含 cause），而不是裸模板错误。 */
	private persistenceRequiredError(): KernelError {
		return this.persistenceError ?? turnPersistenceError();
	}
}

function continuationCancelledError(): KernelError {
	return new KernelError(KERNEL_ERROR_CODES.TURN_INTERRUPTED, "Pending continuation was cancelled");
}

async function waitForTurnRelease(
	turn: Promise<SessionSendResult>,
	signal?: AbortSignal,
	released?: Promise<void>,
): Promise<void> {
	const settled = Promise.race([turn, ...(released ? [released] : [])]).then(
		() => undefined,
		() => undefined,
	);
	if (!signal) {
		await settled;
		return;
	}
	signal.throwIfAborted();
	await new Promise<void>((resolve, reject) => {
		const abort = () => reject(signal.reason);
		signal.addEventListener("abort", abort, { once: true });
		void settled.finally(() => signal.removeEventListener("abort", abort)).then(resolve, resolve);
	});
}

function createDeferred(): { readonly promise: Promise<void>; resolve(): void } {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function waitTimeout(waitMs: number): Promise<void> {
	return new Promise<void>((resolve) => {
		const timer = setTimeout(resolve, waitMs);
		if (typeof timer === "object" && timer !== null && "unref" in timer && typeof timer.unref === "function") {
			timer.unref();
		}
	});
}

function sessionStateError(state: AgentSessionState): KernelError {
	if (state === "closed" || state === "closing") return sessionClosedError();
	if (state === "recovery_required") return turnPersistenceError();
	return sessionBusyError();
}

function abortReasonText(reason: unknown): string | undefined {
	return typeof reason === "string" ? reason : reason instanceof Error ? reason.message : undefined;
}

class MutableTurnSessionIdentity implements TurnSessionIdentity {
	private currentSessionId: string;

	constructor(sessionId: string) {
		this.currentSessionId = sessionId;
	}

	get sessionId(): string {
		return this.currentSessionId;
	}

	transition(sessionId: string): void {
		if (!sessionId) throw new Error("Conversation continuation requires a target session ID");
		this.currentSessionId = sessionId;
	}
}

export async function createAgentSession(options: CreateAgentSessionOptions): Promise<AgentSession> {
	return AgentSession.create(options);
}

export async function resumeAgentSession(options: CreateAgentSessionOptions): Promise<AgentSession> {
	return AgentSession.resume(options);
}
