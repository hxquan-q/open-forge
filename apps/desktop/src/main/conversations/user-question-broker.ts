// Modified by The Open Forge contributors.
import type {
	CodingAgentQuestionFunctionRequest,
	CodingAgentQuestionResult,
} from "@vetta/coding-agent/function-extensions";

export type UserQuestionHandler = (
	request: CodingAgentQuestionFunctionRequest,
	signal?: AbortSignal,
) => Promise<CodingAgentQuestionResult>;

/** Renderer 侧问答面板的接入点；窗口重建时可替换，挂起的问题不随之丢失。 */
export interface DesktopUserQuestionPresenter {
	present(request: CodingAgentQuestionFunctionRequest): void;
}

export interface UserQuestionResolvedEvent {
	requestId: string;
	sessionId: string;
}

type UserQuestionResolvedListener = (event: UserQuestionResolvedEvent) => void;

const CANCELLED_QUESTION: CodingAgentQuestionResult = { cancelled: true, answers: [] };

/** Sanitize the renderer's ask_user_question reply into the Coding Agent product result. */
export function normalizeQuestionResult(value: unknown): CodingAgentQuestionResult {
	if (typeof value !== "object" || value === null) return { cancelled: true, answers: [] };
	const v = value as Record<string, unknown>;
	if (v.cancelled === true || !Array.isArray(v.answers)) return { cancelled: true, answers: [] };
	const answers = (v.answers as Array<Record<string, unknown>>)
		.filter((a) => a && typeof a.question === "string" && Array.isArray(a.answers))
		.map((a) => ({
			question: a.question as string,
			answers: (a.answers as unknown[]).filter((x): x is string => typeof x === "string"),
		}));
	return { cancelled: false, answers };
}

interface PendingQuestion {
	readonly request: CodingAgentQuestionFunctionRequest;
	finish(result: CodingAgentQuestionResult): void;
}

/** 拥有「等待用户回答」的生命周期：挂起、应答、中断与窗口失效都在这里收口。 */
export class DesktopUserQuestionBroker {
	private presenter: DesktopUserQuestionPresenter | undefined;
	private readonly debugHandlers = new Map<string, UserQuestionHandler>();
	private readonly remoteHandlers = new Map<string, UserQuestionHandler>();
	/** 仅 presenter 呈现的问题可经 `respond` 应答，与旧 questionMap 口径一致。 */
	private readonly presented = new Map<string, PendingQuestion>();
	/** 所有仍在处理的请求（含 remote/debug handler），供待答清单查询。 */
	private readonly pendingQuestions = new Map<string, CodingAgentQuestionFunctionRequest>();
	private readonly resolvedListeners = new Set<UserQuestionResolvedListener>();

	readonly handle: UserQuestionHandler = async (request, signal) => {
		if (signal?.aborted) return CANCELLED_QUESTION;
		const presenter = this.presenter;
		const handlers = [
			this.remoteHandlers.get(request.sessionId),
			this.debugHandlers.get(request.sessionId),
			presenter ? this.createPresenterHandler(request, presenter) : undefined,
		].filter((handler): handler is UserQuestionHandler => handler !== undefined);
		if (handlers.length === 0) return CANCELLED_QUESTION;

		this.pendingQuestions.set(request.requestId, request);
		const controllers = handlers.length > 1 ? handlers.map(() => new AbortController()) : undefined;
		const abortHandlers = (): void => {
			for (const controller of controllers ?? []) controller.abort();
		};
		if (signal && controllers) signal.addEventListener("abort", abortHandlers, { once: true });

		try {
			if (!controllers) return await handlers[0](request, signal);
			return await Promise.race(handlers.map((handler, index) => handler(request, controllers[index].signal)));
		} finally {
			if (signal && controllers) signal.removeEventListener("abort", abortHandlers);
			abortHandlers();
			if (this.pendingQuestions.get(request.requestId) === request) {
				this.pendingQuestions.delete(request.requestId);
			}
			const event = { requestId: request.requestId, sessionId: request.sessionId };
			for (const listener of this.resolvedListeners) listener(event);
		}
	};

	/** presenter 是竞速的一方：中断或竞速落败时以取消收尾，应答只影响仍挂起的呈现。 */
	private createPresenterHandler(
		request: CodingAgentQuestionFunctionRequest,
		presenter: DesktopUserQuestionPresenter,
	): UserQuestionHandler {
		return (_request, signal) =>
			new Promise<CodingAgentQuestionResult>((resolve) => {
				if (signal?.aborted) {
					resolve(CANCELLED_QUESTION);
					return;
				}
				const finish = (result: CodingAgentQuestionResult): void => {
					if (this.presented.get(request.requestId)?.request !== request) return;
					this.presented.delete(request.requestId);
					signal?.removeEventListener("abort", onAbort);
					resolve(result);
				};
				const onAbort = (): void => finish(CANCELLED_QUESTION);
				this.presented.set(request.requestId, { request, finish });
				signal?.addEventListener("abort", onAbort, { once: true });
				presenter.present(request);
			});
	}

	isAvailable(): boolean {
		return this.presenter !== undefined || this.debugHandlers.size > 0 || this.remoteHandlers.size > 0;
	}

	listPendingQuestions(): CodingAgentQuestionFunctionRequest[] {
		return [...this.pendingQuestions.values()];
	}

	/** Renderer 的应答是不可信输入：结构不合法一律按取消处理。 */
	respond(requestId: string, result: unknown): void {
		this.presented.get(requestId)?.finish(normalizeQuestionResult(result));
	}

	/** 渲染进程失效或窗口销毁：没有人能再回答这些请求。 */
	cancelAll(): void {
		for (const question of [...this.presented.values()]) question.finish(CANCELLED_QUESTION);
	}

	registerRemoteHandler(sessionId: string, handler: UserQuestionHandler): () => void {
		if (this.remoteHandlers.has(sessionId)) {
			throw new Error(`A remote question handler is already registered for session ${sessionId}.`);
		}
		this.remoteHandlers.set(sessionId, handler);
		return () => {
			if (this.remoteHandlers.get(sessionId) === handler) this.remoteHandlers.delete(sessionId);
		};
	}

	onQuestionResolved(listener: UserQuestionResolvedListener): () => void {
		this.resolvedListeners.add(listener);
		return () => this.resolvedListeners.delete(listener);
	}

	setPresenter(presenter: DesktopUserQuestionPresenter): () => void {
		this.presenter = presenter;
		return () => {
			if (this.presenter === presenter) this.presenter = undefined;
		};
	}

	registerDebugHandler(sessionId: string, handler: UserQuestionHandler): () => void {
		if (this.debugHandlers.has(sessionId)) {
			throw new Error(`A debug question handler is already registered for session ${sessionId}.`);
		}
		this.debugHandlers.set(sessionId, handler);
		return () => {
			if (this.debugHandlers.get(sessionId) === handler) this.debugHandlers.delete(sessionId);
		};
	}
}

const sharedUserQuestionBroker = new DesktopUserQuestionBroker();

export function getDesktopUserQuestionBroker(): DesktopUserQuestionBroker {
	return sharedUserQuestionBroker;
}
