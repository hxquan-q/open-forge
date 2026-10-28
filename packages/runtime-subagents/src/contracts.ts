// Modified by The Open Forge contributors.
export type SubagentTypeId = string;

export type SubagentStatus = "queued" | "pending" | "running" | "completed" | "failed" | "interrupted";

export type SubagentSchedulingPhase = "queued" | "admitted" | "rejected" | "settling" | "settle-deadline" | "released";

export type SubagentSchedulingReason =
	| "capacity"
	| "completed"
	| "failed"
	| "interrupted"
	| "cancelled-before-start"
	| "settle-deadline"
	| "parent-disposed";

/** Diagnostic projection only: no task names, pending IDs, content, paths or persistent state. */
export interface SubagentSchedulingEvent {
	readonly phase: SubagentSchedulingPhase;
	readonly reason?: SubagentSchedulingReason;
	readonly timestamp: number;
	readonly parentSessionId: string;
	/** Opaque per-coordinator execution identity; stable across child ID binding and terminal generation changes. */
	readonly admissionId?: string;
	readonly childSessionId?: string;
	/** Current snapshot delivery generation, which advances at terminal commit rather than admission. */
	readonly generation?: number;
	readonly maxConcurrent: number;
	readonly activeCount: number;
	readonly queuedCount: number;
	readonly waitMs?: number;
	readonly heldMs?: number;
}

export interface SubagentUsageSnapshot {
	readonly input: number;
	readonly output: number;
	readonly cacheRead: number;
	readonly cacheWrite: number;
	readonly costTotal: number;
}

export interface SubagentSnapshot {
	readonly id: string;
	readonly taskName: string;
	readonly path: string;
	readonly agentType: SubagentTypeId;
	readonly status: SubagentStatus;
	readonly task: string;
	readonly parentSessionId: string;
	/** Tool call in the parent conversation that created this child. */
	readonly originToolCallId?: string;
	readonly sessionFile?: string;
	readonly startedAt: number;
	readonly endedAt?: number;
	readonly finalText?: string;
	readonly errorMessage?: string;
	readonly usage: SubagentUsageSnapshot;
	readonly generation: number;
	readonly title?: string;
	/** Automatic parent notification policy for this generation. */
	readonly deliveryMode?: "terminal" | "batch";
	/** Stable batch barrier identity when deliveryMode is batch. */
	readonly batchId?: string;
}

export interface SubagentSpawnRequest {
	readonly taskName: string;
	readonly originToolCallId?: string;
	readonly message: string;
	readonly agentType: SubagentTypeId;
	readonly title?: string;
	readonly deliveryMode?: "terminal" | "batch";
	readonly batchId?: string;
}

export interface SubagentTypeDefinition<TProfile = unknown> {
	readonly id: SubagentTypeId;
	readonly label: string;
	readonly description: string;
	readonly profile: TProfile;
}

export interface SubagentTypeRegistryLike<TProfile = unknown> {
	get(id: SubagentTypeId): SubagentTypeDefinition<TProfile> | undefined;
	list(): readonly SubagentTypeDefinition<TProfile>[];
	ids(): readonly SubagentTypeId[];
}

/** agent_end 的结局；缺省视为 "completed"，兼容只发裸事件的旧 Child 实现。 */
export type SubagentChildEndReason = "completed" | "failed" | "interrupted";

export interface SubagentChildEvent {
	readonly type: "agent_start" | "agent_end";
	readonly reason?: SubagentChildEndReason;
	/** reason === "failed" 时的稳定失败事实（Provider/Runtime 错误文本与错误码）。 */
	readonly errorMessage?: string;
	readonly errorCode?: string;
}

export interface SubagentChildHandle {
	readonly sessionId: string;
	readonly sessionFile?: string;
	prompt(text: string): Promise<void>;
	sendMessage(text: string): Promise<void>;
	followUp(text: string): Promise<void>;
	abort(): void | Promise<void>;
	waitForIdle(): Promise<void>;
	isStreaming(): boolean;
	getLastAssistantText(): string | undefined;
	readUsage?(): SubagentUsageSnapshot;
	dispose(): void | Promise<void>;
	subscribe(listener: (event: SubagentChildEvent) => void): () => void;
}

export interface SubagentChildFactory<TProfile = unknown> {
	create(
		request: SubagentSpawnRequest,
		type: SubagentTypeDefinition<TProfile>,
		signal?: AbortSignal,
	): Promise<SubagentChildHandle>;
	reopen?(
		snapshot: SubagentSnapshot,
		type: SubagentTypeDefinition<TProfile>,
		signal?: AbortSignal,
	): Promise<SubagentChildHandle>;
}

export interface SubagentStartLifecycleInput {
	readonly id: string;
	readonly agentType: string;
	readonly message: string;
}

export interface SubagentStartLifecycleResult {
	readonly message?: string;
	readonly blockedReason?: string;
}

export interface SubagentStopLifecycleInput {
	readonly id: string;
	readonly agentType: string;
	readonly generation: number;
	readonly stopHookActive: boolean;
	readonly lastAssistantText?: string;
	readonly sessionFile?: string;
	readonly interrupted: boolean;
}

export interface SubagentStopLifecycleResult {
	readonly continuation?: string;
}

export interface SubagentLifecycle {
	beforeStart?(input: SubagentStartLifecycleInput): Promise<SubagentStartLifecycleResult | undefined>;
	beforeStop?(input: SubagentStopLifecycleInput): Promise<SubagentStopLifecycleResult | undefined>;
}

export interface SubagentDeliveryMarker {
	readonly id: string;
	readonly generation: number;
}

export interface SubagentRecoveryState {
	readonly agents: readonly SubagentSnapshot[];
	readonly delivered: readonly SubagentDeliveryMarker[];
}

export interface SubagentCoordinatorOptions<TProfile = unknown> {
	readonly factory: SubagentChildFactory<TProfile>;
	readonly typeRegistry: SubagentTypeRegistryLike<TProfile>;
	readonly parentSessionId: string;
	readonly maxConcurrent?: number;
	readonly lifecycle?: SubagentLifecycle;
	readonly onNotify?: (agents: readonly SubagentSnapshot[]) => void;
	readonly onUpdate?: (agents: readonly SubagentSnapshot[]) => void;
	readonly onDeliveryClaimed?: (marker: SubagentDeliveryMarker) => void;
	readonly onError?: (error: unknown, operation: string) => void;
	/** Best-effort diagnostics; callback failures never change scheduling or delivery. */
	readonly onSchedulingEvent?: (event: SubagentSchedulingEvent) => void | Promise<void>;
	readonly formatInitialMessage?: (snapshot: SubagentSnapshot, message: string) => string;
	readonly clock?: { now(): number };
	readonly idGenerator?: { next(): string };
	readonly notificationDelayMs?: number;
	/**
	 * 子会话创建/重开的宽限（毫秒）。超时按启动失败收敛成员终态；
	 * 传入非有限值恢复旧的无限等待。
	 */
	readonly startDeadlineMs?: number;
	/**
	 * 成员中断/释放等收尾的宽限（毫秒）。超时强制收敛并释放并发槽位，
	 * 避免忽略 AbortSignal 的 Provider/Tool 让 Coordinator 永久等待；
	 * 传入非有限值恢复旧的无限等待。
	 */
	readonly settleDeadlineMs?: number;
}

export interface SubagentWaitOptions {
	readonly targets?: readonly string[];
	readonly timeoutMs?: number;
}

export interface SubagentWaitResult {
	readonly timedOut: boolean;
	readonly agents: readonly SubagentSnapshot[];
}

/** Product tools depend on this control contract, never on a concrete coordinator. */
export interface SubagentCoordinatorPort {
	list(): readonly SubagentSnapshot[];
	get(target: string): SubagentSnapshot | undefined;
	clearFinished(): number;
	registeredTypeIds(): readonly SubagentTypeId[];
	spawn(request: SubagentSpawnRequest): Promise<SubagentSnapshot>;
	spawnMany(requests: readonly SubagentSpawnRequest[]): readonly SubagentSnapshot[];
	sendMessage(target: string, message: string): Promise<SubagentSnapshot>;
	followUp(target: string, message: string): Promise<SubagentSnapshot>;
	interrupt(target: string): SubagentSnapshot;
	interruptAll(): readonly SubagentSnapshot[];
	wait(options?: SubagentWaitOptions): Promise<SubagentWaitResult>;
	dispose(): Promise<void>;
}

export const TASK_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
export const SUBAGENT_FINAL_TEXT_LIMIT = 16 * 1024;
export const DEFAULT_SUBAGENT_START_DEADLINE_MS = 30_000;
export const DEFAULT_SUBAGENT_SETTLE_DEADLINE_MS = 10_000;

export function isValidTaskName(name: string): boolean {
	return name.length > 0 && name !== "root" && TASK_NAME_PATTERN.test(name);
}

export function taskPath(taskName: string): string {
	return `/root/${taskName}`;
}

export function emptyUsage(): SubagentUsageSnapshot {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costTotal: 0 };
}

export function clipFinalText(text: string | undefined, limit = SUBAGENT_FINAL_TEXT_LIMIT): string | undefined {
	if (text === undefined || text.length <= limit) return text;
	return `${text.slice(0, limit)}\n…[truncated ${text.length - limit} chars; see child transcript]`;
}
