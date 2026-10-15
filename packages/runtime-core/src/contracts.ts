// Modified by The Open Forge contributors.
import type { ThinkingLevel, ToolPhase } from "@vetta/agent-core";
import type { AssistantMessageEvent, CacheUsageReporting, Message, Model } from "@vetta/ai";
import type { ContextCompositionReport } from "./context-composition/contracts.js";
import type { RuntimeFailure, RuntimeFailureDetails, RuntimeFailureOrigin } from "./failure-contract.js";
import type { RuntimeSessionFactEvent, SessionContextRecord } from "./kernel/contracts.js";
import type { SessionContextState, SessionContextStateEvent } from "./session-context-state.js";
import type { SessionExtensionEndpointToken, SessionExtensionObservation } from "./session-extensions/contracts.js";
import type { ApprovalDecision, ApprovalRequest, ArtifactDescriptor, RuntimeTaskEvent } from "./task/contracts.js";
import type { RuntimeSessionTaskState } from "./task/session-projection.js";

export interface PromptResourceRef {
	/** Extension-owned resource discriminator. Runtime keeps it opaque. */
	kind: string;
	name: string;
}

export interface PromptAttachmentRef {
	kind: "file" | "directory" | "image";
	path: string;
}

export type RuntimeEventSource = "runtime-core" | "agent" | "tool" | "extension";

export interface SessionEventBase {
	schemaVersion: 1;
	/** Runtime-owned events use "runtime"; omitted only by legacy fixture/input events. */
	channel?: "runtime";
	sessionId: string;
	eventId: string;
	timestamp: number;
	source: RuntimeEventSource;
	/**
	 * RuntimeHost 为实时与重放事件分配的会话内单调序号。订阅建立时合成的
	 * created / initial snapshot 事件和直接使用底层 EventStream 的嵌入方不带该字段。
	 */
	sequence?: number;
}

/**
 * @vetta/ai 模型协议事件及其 Session 传输元数据。
 *
 * AssistantMessageEvent 的 `type` 和载荷字段保持在顶层；Runtime 只补充 channel
 * 与会话相关元数据，不再包裹或映射为第二套模型事件。
 */
export type AssistantSessionEvent = Omit<SessionEventBase, "channel" | "source"> & {
	channel: "assistant";
	source: "agent";
	turnId?: string;
	modelCallIndex: number;
} & AssistantMessageEvent;

export interface SessionLifecycleEvent extends SessionEventBase {
	type: "session.lifecycle";
	phase: "created" | "agent_start" | "turn_start" | "turn_end" | "agent_end" | "aborted";
}

export interface SessionPathChangedEvent extends SessionEventBase {
	type: "session.path_changed";
	previousSessionId: string;
	previousPath?: string;
	path?: string;
	reason: string;
}

export interface MessageDeltaEvent extends SessionEventBase {
	type: "message.delta";
	delta: string;
}

export interface ThinkingDeltaEvent extends SessionEventBase {
	type: "thinking.delta";
	delta: string;
}

export interface ToolCallGeneratingEvent extends SessionEventBase {
	type: "toolcall.start";
	toolCallId: string;
	toolName: string;
}

export interface ToolStartEvent extends SessionEventBase {
	type: "tool.start";
	toolCallId: string;
	toolName: string;
	args: unknown;
	/** Absolute timestamp (ms) when the tool began executing. */
	startedAt: number;
}

export interface ToolUpdateEvent extends SessionEventBase {
	type: "tool.update";
	toolCallId: string;
	toolName: string;
	partialResult: unknown;
}

/**
 * Emitted when a tool reports a phase boundary via ctx.phase(label) during
 * execution. Out-of-band metadata — UI-only, never sent to LLMs.
 */
export interface ToolPhaseEvent extends SessionEventBase {
	type: "tool.phase";
	toolCallId: string;
	toolName: string;
	label: string;
	/** Offset (ms) from the tool's startedAt. */
	atMs: number;
}

export interface ToolEndEvent extends SessionEventBase {
	type: "tool.end";
	toolCallId: string;
	toolName: string;
	isError: boolean;
	result: unknown;
	/** Absolute timestamp (ms) when the tool began executing. */
	startedAt: number;
	/** Total execution duration in milliseconds. */
	durationMs: number;
	/** Phases reported by the tool via ctx.phase(label) — possibly empty. */
	phases: ToolPhase[];
}

export interface UsageUpdateEvent extends SessionEventBase {
	type: "usage.update";
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	/** Cache detail available for this exact provider response. */
	cacheUsageReporting?: CacheUsageReporting;
	/** Exact model that produced this usage; optional for external runtime observations. */
	model?: {
		api: string;
		provider: string;
		id: string;
	};
	costTotal: number;
	/** Context window usage percentage (0-100), or null if unknown (e.g. after compaction) */
	contextPercent: number | null;
	/** Provider-reported total input/context tokens when available. */
	contextTokens?: number | null;
	/** Total context window size in tokens */
	contextWindow: number;
	/** Privacy-safe breakdown for the exact provider-facing context. */
	contextComposition?: ContextCompositionReport;
}

export interface SessionError extends RuntimeFailure {}

export interface ErrorEvent extends SessionEventBase {
	type: "error";
	error: SessionError;
	/** Stable turn correlation. Present for failures persisted as turn.failed. */
	turnId?: string;
	/**
	 * 这条错误最终发出前，自动重试实际尝试过的次数（0 = 没重试过）。
	 * 由 session-events 的挂起状态机累计，供 UI 说「已自动重试 N 次仍失败」。
	 */
	retryAttempts?: number;
}

/** 自动重试开始：一次可重试错误后进入退避等待。 */
export interface RetryStartEvent extends SessionEventBase {
	type: "retry.start";
	attempt: number;
	maxAttempts: number;
	delayMs: number;
	errorMessage: string;
	/** Structured failure that triggered the retry; errorMessage remains legacy display text. */
	failure?: RuntimeFailure;
}

/** 自动重试结束：success=false 表示重试次数耗尽，随后会有一条 error 事件。 */
export interface RetryEndEvent extends SessionEventBase {
	type: "retry.end";
	success: boolean;
	attempt: number;
	finalError?: string;
}

export interface SessionExtensionEvent extends SessionEventBase, SessionExtensionObservation {}

/** Task 生命周期事实投影到宿主/UI；载荷即持久化的 RuntimeTaskEvent，可重放重建快照。 */
export interface TaskLifecycleEvent extends SessionEventBase {
	type: "task.lifecycle";
	task: RuntimeTaskEvent;
}

/** Artifact descriptor 事实投影到宿主/UI；文件内容是事实源，descriptor 仅作索引。 */
export interface ArtifactDescriptorEvent extends SessionEventBase {
	type: "artifact.descriptor";
	artifact: ArtifactDescriptor;
}

/** 审批请求事实投影：高风险动作先落盘再阻塞等待，UI 只消费该状态。 */
export interface ApprovalRequestedEvent extends SessionEventBase {
	type: "approval.requested";
	request: ApprovalRequest;
}

/** 审批决策事实投影：`edit` 不构成批准，随后的新请求有新的 approvalId。 */
export interface ApprovalDecisionEvent extends SessionEventBase {
	type: "approval.decision";
	approvalId: string;
	decision: ApprovalDecision;
}

/**
 * 会话激活工具集发生变化（插件在会话创建之后才注册/注销工具时触发）。
 * renderer 据此刷新输入栏 badge 的 `requiresActiveTool` 闸门——否则打开会话那一刻
 * 拿到的 `getState().activeToolNames` 快照会一直停留在插件就绪之前的旧集合。
 */
export interface ActiveToolsUpdateEvent extends SessionEventBase {
	type: "active_tools_update";
	activeToolNames: string[];
}

export interface CompactionStartEvent extends SessionEventBase {
	type: "compaction.start";
	reason: "threshold" | "overflow" | "manual";
	contextTokens?: number;
	contextWindow?: number;
	thresholdTokens?: number;
}

export interface CompactionEndEvent extends SessionEventBase {
	type: "compaction.end";
	cancelled?: boolean;
	success: boolean;
	reason?: "threshold" | "overflow" | "manual";
	tokensBefore?: number;
	/** Compaction commit 后的活动模型上下文占用。 */
	contextPercent?: number | null;
	contextTokens?: number | null;
	contextWindow?: number;
	errorMessage?: string;
	failure?: RuntimeFailure;
}

export interface RuntimeSandboxGrantInfo {
	id: string;
	sessionId: string;
	toolName: string;
	capability: "file.read" | "file.write" | "network";
	grantRoot: string;
	firstTarget: string;
	createdAt: number;
}

export type SessionEvent =
	| SessionContextStateEvent
	| SessionLifecycleEvent
	| SessionPathChangedEvent
	| AssistantSessionEvent
	| MessageDeltaEvent
	| ThinkingDeltaEvent
	| ToolCallGeneratingEvent
	| ToolStartEvent
	| ToolUpdateEvent
	| ToolPhaseEvent
	| ToolEndEvent
	| UsageUpdateEvent
	| ErrorEvent
	| SessionExtensionEvent
	| TaskLifecycleEvent
	| ArtifactDescriptorEvent
	| ApprovalRequestedEvent
	| ApprovalDecisionEvent
	| ActiveToolsUpdateEvent
	| CompactionStartEvent
	| CompactionEndEvent
	| RetryStartEvent
	| RetryEndEvent
	| QueueChangedEvent;

/** prompt 的即时回执（ADR-0060）：排队时立即返回，宿主/UI 据此区分「已发出」与「已排队」。 */
export interface RuntimeTurnPromptOutcome {
	readonly status: "completed" | "cancelled" | "failed" | "queued" | "handled";
	/** Structured failure for a terminal failed turn. Kept on the prompt receipt so
	 * retry adapters cannot mistake a failed turn for a successful one. */
	readonly error?: SessionError;
	/** The durable turn identity when this receipt represents a completed turn. */
	readonly turnId?: string;
	readonly pendingCount?: number;
	readonly queueItemId?: string;
}

/** 原子 queue-if-running 的宿主回执；idle 表示调用方应走正常的新 Turn admission。 */
export type RuntimeQueuePromptIfRunningOutcome =
	| { readonly status: "idle" }
	| {
			readonly status: "queued";
			readonly behavior: "steer" | "followUp";
			readonly pendingCount: number;
			readonly id?: string;
	  };

/** 输入队列变化广播：renderer 镜像队列抽屉、插件卡片据此渲染排队状态（ADR-0060）。 */
export interface QueueChangedEvent extends SessionEventBase {
	type: "queue.changed";
	paused: boolean;
	entries: Array<{
		id: string;
		behavior: "steer" | "followUp";
		kind?: "message" | "context_compaction";
		displayText: string;
	}>;
	/** 完整可序列化快照，宿主持久化 sidecar 用；renderer 无需消费。 */
	snapshot: unknown;
}

/** {@link SessionFacade.attach} 的回执：同一次同步步骤内取得的订阅与历史快照。 */
export interface SessionAttachment {
	readonly unsubscribe: () => void;
	/**
	 * attach 时刻的持久化历史拷贝；运行中回合（`runningTurnId`）的消息以重放事件
	 * 重建，消费端不把两者重复拼接。重放事件先于本回执经 handler 同步送达。
	 */
	readonly history: HistoryEntry[];
	/**
	 * 运行中回合身份；会话空闲时缺省。回合首个 assistant 事件到达前的窗口内同为
	 * undefined（身份随首个事件可观察），消费端可结合快照 isStreaming 区分。
	 */
	readonly runningTurnId?: string;
}

export interface SessionStateSnapshot {
	sessionId: string;
	contextState?: SessionContextState;
	/** 持久化 Session 所属的平级主 Agent；历史会话可缺省。 */
	agentId?: string;
	model?: Model<any>;
	thinkingLevel: ThinkingLevel;
	executionMode: SessionExecutionMode;
	isStreaming: boolean;
	/** Timestamp (ms) for the current agent_start, if this session is streaming. */
	currentTurnStartedAt?: number;
	/** Identity of the running Turn (learned from assistant events), so a subscriber joining mid-Turn can target its messages. */
	currentTurnId?: string;
	/**
	 * 宿主事件中继最近一次观察到该会话事件的时间戳（ms，事件自身时钟）；
	 * 尚无任何事件时为 undefined。流式会话的逐事件活动证据：中断巡检据此区分
	 * 「健康长回合」（事件持续流动）与「零事件悬挂」（长时间无任何事件）。
	 */
	lastEventAt?: number;
	messageCount: number;
	/** Context window usage percentage (0-100), or null if unknown */
	contextPercent: number | null;
	/** Provider-reported total input/context tokens when available. */
	contextTokens?: number | null;
	/** Total context window size in tokens */
	contextWindow: number;
	/** Latest model-call context composition, when a call has been prepared. */
	contextComposition?: ContextCompositionReport;
	/** 当前激活（模型可见）的工具名集合。renderer 据此让输入栏 badge 跟随工具 scope。 */
	activeToolNames: string[];
	/** Parent session jsonl path when this session was forked. */
	parentSessionPath?: string;
	/** User entry id in the parent session this fork was created from. */
	parentEntryId?: string;
}

export interface ProjectInfo {
	cwd: string;
	sessionCount: number;
}

export interface SessionHistoryInfo {
	id: string;
	path: string;
	/** 创建该 Conversation 的平级主 Agent；历史格式可缺省。 */
	agentId?: string;
	cwd: string;
	name?: string;
	firstMessage: string;
	modifiedAt: number;
	/** Trimmed preview (~120 chars) of the most recent user/assistant message text. */
	lastMessagePreview?: string;
	/** Conversation file size in bytes when known (session list indexing). */
	fileSizeBytes?: number;
	/** Parent session jsonl path when this session was forked. */
	parentSessionPath?: string;
	/** User entry id in the parent session this fork was created from. */
	parentEntryId?: string;
}

export type SessionExecutionMode = "sandbox" | "full-access";

/** RuntimeHost 创建 Conversation Session 时选择的平级主 Agent 与配置作用域。 */
export interface RuntimeSessionAgentSelection {
	readonly id: string;
	/** 可选钉住已经解析的 Definition revision；主要用于长生命周期产品组合保持前缀与行为稳定。 */
	readonly definitionRevisionId?: string;
	/** 可选稳定 Instance identity；省略时由 Runtime 生成。 */
	readonly instanceId?: string;
	/** 相同 key、Definition revision 与配置 revision 可以复用一个 Agent Instance。 */
	readonly instanceKey?: string;
	/** Runtime Core 不解释的 Instance 配置，由 Definition 在产品边界校验。 */
	readonly instanceConfiguration?: unknown;
	/** 共享带配置的 Instance 时必填；Runtime Core 不比较或序列化 unknown 配置。 */
	readonly instanceConfigurationRevision?: string;
	/** 只传给本次 Agent Session 的产品配置。 */
	readonly sessionConfiguration?: unknown;
}

export interface SessionConfig {
	/** 选择本次会话使用的平级主 Agent；缺省兼容策略由最终宿主决定。 */
	agent?: RuntimeSessionAgentSelection;
	/** 新建会话的稳定身份；恢复既有会话时由 sessionPath 解析并校验。 */
	sessionId?: string;
	cwd?: string;
	agentDir?: string;
	sessionPath?: string;
	sessionDir?: string;
	model?: Model<any>;
	thinkingLevel?: ThinkingLevel;
	executionMode?: SessionExecutionMode;
	/**
	 * 注入到 bash/shell 工具子进程的环境变量覆盖层（如 TMPDIR/TEMP/TMP）。
	 * 仅对该 session 内的命令执行生效；不传则行为等同旧版。
	 */
	env?: Record<string, string>;
}

export interface PromptRequest {
	text: string;
	/**
	 * Product-authored context committed in the same Turn as this prompt. Keeping it
	 * on the request prevents a separate context write from racing with admission.
	 */
	context?: readonly SessionContextRecord[];
	/** Structured extension resource selection. Kept separate from prompt text. */
	promptRef?: PromptResourceRef;
	/** Absolute filesystem references attached to this turn. Read by the agent on demand. */
	attachments?: PromptAttachmentRef[];
	images?: Array<{ type: "image"; data: string; mimeType: string }>;
	streamingBehavior?: "steer" | "followUp";
	/** Model key in "provider/modelId" format — ensures the prompt uses exactly this model */
	modelKey?: string;
	/**
	 * Per-turn reasoning effort, travelling alongside `modelKey` so the model and its
	 * chosen level stay consistent. Passed through to the agent's thinking level for this
	 * turn. Value is one of the selected model's configured reasoning levels (or "off").
	 */
	reasoning?: string;
	/**
	 * Per-turn metadata bag carried alongside the prompt. Not sent to the model
	 * as content; consumed host-side / by the input pipeline. Opaque pass-through.
	 */
	metadata?: Record<string, unknown>;
}

export interface SettingsPatch {
	thinkingLevel?: ThinkingLevel;
	steeringMode?: "all" | "one-at-a-time";
	followUpMode?: "all" | "one-at-a-time";
	/** Model key in "provider/modelId" format */
	modelKey?: string;
}

export interface AssistantTurnTiming {
	startedAt: number;
	endedAt: number;
	durationMs: number;
}

/** Sibling user-message versions under the same parent (for branch switch UI). */
export interface HistoryMessageBranch {
	/** entryIds of user-message siblings, oldest → newest */
	siblings: string[];
	/** Index of the current message within siblings */
	index: number;
}

/**
 * A history entry for UI display. Includes messages AND compaction boundaries.
 * The UI uses this to render complete conversation history (even after compaction).
 */
export type HistoryEntry =
	| {
			type: "message";
			/** Session tree entry id (coding-agent). */
			entryId?: string;
			parentId?: string | null;
			message: Message;
			/** Present on user messages when multiple sibling versions exist (or always when known). */
			branch?: HistoryMessageBranch;
	  }
	| {
			type: "compaction";
			entryId?: string;
			summary: string;
			tokensBefore: number;
			timestamp: string;
	  }
	| { type: "assistant_turn_timing"; timing: AssistantTurnTiming; timestamp: string }
	| {
			type: "error";
			/** Stable conversation entry id when the failure was persisted as a document fact. */
			entryId?: string;
			/** Runtime / provider error code when one is available. */
			code?: string;
			/** Whether the failure may succeed after a retry. */
			retryable?: boolean;
			/** Layer that produced the failure. */
			origin?: RuntimeFailureOrigin;
			/** Safe provider/model diagnostics retained for history replay. */
			details?: RuntimeFailureDetails;
			/** Stable turn correlation when the failure belongs to a persisted turn. */
			turnId?: string;
			message: string;
			timestamp: string;
	  }
	/** Opaque marker projected from a custom conversation record for host-side interpretation. */
	| { type: "custom_marker"; customType: string; details?: unknown; timestamp: string }
	/** Marker that the next user message carried a structured extension resource reference. */
	| { type: "prompt_ref_marker"; promptRef: PromptResourceRef; timestamp: string }
	/** Marker that the next user message was sent with structured filesystem attachments. */
	| { type: "prompt_attachments_marker"; attachments: PromptAttachmentRef[]; timestamp: string }
	| {
			type: "tool_timing";
			toolCallId: string;
			toolName: string;
			startedAt: number;
			durationMs: number;
			phases: ToolPhase[];
			timestamp: string;
	  };

export interface SessionFacade {
	listSandboxGrants(sessionId: string): RuntimeSandboxGrantInfo[];
	revokeSandboxGrant(sessionId: string, grantId: string): boolean;
	revokeAllSandboxGrants(sessionId: string): number;
	createSession(config?: SessionConfig): Promise<{ sessionId: string }>;
	setExecutionMode(sessionId: string, mode: SessionExecutionMode): Promise<void>;
	setGlobalExecutionMode(mode: SessionExecutionMode): Promise<void>;
	prompt(sessionId: string, request: PromptRequest): Promise<RuntimeTurnPromptOutcome>;
	/** Waits for the current Turn to release, then atomically admits this prompt. */
	promptWhenAvailable(
		sessionId: string,
		request: PromptRequest,
		signal?: AbortSignal,
	): Promise<RuntimeTurnPromptOutcome>;
	queuePromptIfRunning(sessionId: string, request: PromptRequest): Promise<RuntimeQueuePromptIfRunningOutcome>;
	continue(sessionId: string): Promise<void>;
	abort(sessionId: string): Promise<void>;
	invokeSessionExtension<Input, Output>(
		sessionId: string,
		token: SessionExtensionEndpointToken<Input, Output>,
		input: Input,
		signal?: AbortSignal,
	): Promise<Output>;
	subscribe(sessionId: string, handler: (event: SessionEvent) => void): () => void;
	/**
	 * 订阅与读历史合成一次快照：运行中回合先经 handler 重放，历史在同一同步步骤
	 * 内读取，二者之间既无空窗也无重叠；回执携带运行中回合身份供消费端去重。
	 */
	attach(sessionId: string, handler: (event: SessionEvent) => void): SessionAttachment;
	updateSettings(sessionId: string, partialSettings: SettingsPatch): Promise<void>;
	/** Update thinking level for ALL open sessions at once. */
	updateGlobalThinkingLevel(level: ThinkingLevel): void;
	getState(sessionId: string): SessionStateSnapshot;
	getMessages(sessionId: string): Message[];
	/** 从持久化 Task/Artifact 事实重放的会话任务投影；重启后同样由事件流重建。 */
	getTaskState(sessionId: string): RuntimeSessionTaskState;
	/** 追加宿主显式提交的 Task/Artifact 事实（Task 创建、审批、Review、descriptor 等）。 */
	recordTaskFacts(sessionId: string, facts: readonly RuntimeSessionFactEvent[]): Promise<void>;
	/** Full conversation history including compaction boundaries (for UI display). */
	getFullHistory(sessionId: string): HistoryEntry[];
	/**
	 * Read a session .jsonl directly from disk and translate to
	 * HistoryEntry[] without acquiring the session-file lock. Used by the
	 * desktop sidebar's read-only viewer for sessions written by another
	 * process or storage owner.
	 */
	readSessionHistoryFromFile(path: string): { history: HistoryEntry[] };
	/**
	 * Prepare re-edit of a user message: set leaf to its parent and return text.
	 * Caller should then prompt with (possibly edited) text to grow a new branch.
	 */
	navigateForEdit(sessionId: string, entryId: string): Promise<{ text: string; cancelled: boolean }>;
	/** Switch current leaf to the tip of the subtree rooted at entryId (sibling branch). */
	switchBranch(sessionId: string, entryId: string): Promise<{ leafId: string }>;
	/** Delete one message and reparent its descendants to the deleted message's parent. */
	deleteMessage(sessionId: string, entryId: string): Promise<{ leafId: string | null }>;
	/** Remove the active branch's last user turn before sending its edited replacement. */
	replaceLastUserMessage(sessionId: string, entryId: string): Promise<{ leafId: string | null }>;
	/**
	 * Export a fork as a new session file without leaving the current session.
	 * Copies history through the selected user message and that turn's complete reply.
	 */
	forkSession(sessionId: string, entryId: string): Promise<{ path: string; text: string }>;
	listProjects(): Promise<ProjectInfo[]>;
	listSessions(cwd: string, sessionDir?: string): Promise<SessionHistoryInfo[]>;
	deleteSession(sessionPath: string): Promise<void>;
	renameSession(sessionPath: string, name: string): Promise<void>;
	getSessionPath(sessionId: string): string | undefined;
	renameSessionById(sessionId: string, name: string): Promise<void>;
	disposeSession(sessionId: string): Promise<void>;
	disposeAllSessions(): Promise<void>;
}
