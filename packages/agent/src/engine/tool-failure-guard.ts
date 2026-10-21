// Copyright The Open Forge contributors.

/**
 * 有界止损：同一工具 + 同一参数 + 同一确定性错误连续出现时，停止继续自动重试。
 *
 * 为什么不是通用冷却：模型重复调用同一个坏参数属于确定性失败，重试不会产生新信息，
 * 但网络抖动、`stale_reference` 之类的恢复路径必须保留。因此只对白名单里的确定性
 * 错误码计数，且键里同时包含工具名与规范化参数——参数一变就是一次新尝试。
 */

/** 止损结果的错误码：表示这次调用没有执行，而不是工具执行失败。 */
export const AGENT_TOOL_CALL_STOPPED = "AGENT_TOOL_CALL_STOPPED";

export const TOOL_FAILURE_STOP_THRESHOLD = 3;

/**
 * 确定性错误：同样的入参必然得到同样的结论，重试无意义。
 * `stale_reference`、`no_browser_session`、`cancelled` 与网络/执行类错误刻意不在内。
 */
export const DEFAULT_DETERMINISTIC_TOOL_ERROR_CODES: readonly string[] = [
	"AGENT_TOOL_INPUT_INVALID",
	"AGENT_TOOL_NOT_FOUND",
	"invalid_input",
	"policy_denied",
	"unimplemented",
];

export interface ToolFailureGuardOptions {
	/** 连续相同失败达到该次数后止损；小于 2 的值按 2 处理。 */
	readonly threshold?: number;
	readonly deterministicCodes?: readonly string[];
}

export interface ToolFailureOutcome {
	readonly isError: boolean;
	/** 工具结果 `details.code`；没有就是非确定性错误或成功。 */
	readonly code?: string;
}

export type ToolFailureVerdict =
	| { readonly blocked: false }
	| { readonly blocked: true; readonly code: string; readonly attempts: number; readonly message: string };

interface FailureRecord {
	readonly code: string;
	readonly count: number;
}

function stableStringify(value: unknown, depth = 0): string {
	if (depth > 32) return '"[max-depth]"';
	if (value === undefined) return "undefined";
	if (value === null || typeof value !== "object") return JSON.stringify(value) ?? String(value);
	if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item, depth + 1)).join(",")}]`;
	const record = value as Record<string, unknown>;
	const keys = Object.keys(record).sort();
	return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key], depth + 1)}`).join(",")}}`;
}

/** 规范化参数：键顺序不影响判定，模型把同一对象换个顺序写仍然算同一次调用。 */
export function canonicalToolArguments(value: unknown): string {
	return stableStringify(value);
}

function callKey(toolName: string, args: unknown): string {
	return `${toolName}\u0000${canonicalToolArguments(args)}`;
}

function stopMessage(toolName: string, code: string, attempts: number): string {
	return [
		`Stopped: ${toolName} was called with identical arguments and failed ${attempts} times in a row with ${code}.`,
		"Automatic retry of this exact call is disabled for the rest of the turn.",
		"Change the arguments (a different action, field, or URL) or explain the blocker to the user; a new turn also restores normal execution.",
	].join(" ");
}

export class ToolFailureGuard {
	private readonly threshold: number;
	private readonly deterministicCodes: ReadonlySet<string>;
	/** 每个「工具 + 参数」最近一次连续失败。 */
	private readonly failures = new Map<string, FailureRecord>();
	/** 已止损的「工具 + 参数」及其触发错误码。 */
	private readonly stopped = new Map<string, FailureRecord>();

	constructor(options: ToolFailureGuardOptions = {}) {
		const threshold = options.threshold ?? TOOL_FAILURE_STOP_THRESHOLD;
		this.threshold = Number.isSafeInteger(threshold) && threshold >= 2 ? threshold : 2;
		this.deterministicCodes = new Set(options.deterministicCodes ?? DEFAULT_DETERMINISTIC_TOOL_ERROR_CODES);
	}

	/** 执行前判定：该「工具 + 参数」是否已经止损。 */
	check(toolName: string, args: unknown): ToolFailureVerdict {
		const record = this.stopped.get(callKey(toolName, args));
		if (!record) return { blocked: false };
		return {
			blocked: true,
			code: record.code,
			attempts: record.count,
			message: stopMessage(toolName, record.code, record.count),
		};
	}

	/** 执行后记账：成功或非确定性结果清空该键的连续计数，确定性错误累计。 */
	recordResult(toolName: string, args: unknown, outcome: ToolFailureOutcome): void {
		const key = callKey(toolName, args);
		// 成功必须清账，否则两次失败之间插一次成功仍会被累计成连续失败。
		if (!outcome.isError) {
			this.failures.delete(key);
			return;
		}
		if (outcome.code === undefined || outcome.code === AGENT_TOOL_CALL_STOPPED) return;
		if (!this.deterministicCodes.has(outcome.code)) {
			this.failures.delete(key);
			return;
		}
		const previous = this.failures.get(key);
		const count = previous && previous.code === outcome.code ? previous.count + 1 : 1;
		this.failures.set(key, { code: outcome.code, count });
		if (count >= this.threshold) this.stopped.set(key, { code: outcome.code, count });
	}

	/** 只读诊断：当前连续失败与止损规模。 */
	stats(): { readonly tracked: number; readonly stopped: number } {
		return { tracked: this.failures.size, stopped: this.stopped.size };
	}
}

export function createToolFailureGuard(options?: ToolFailureGuardOptions): ToolFailureGuard {
	return new ToolFailureGuard(options);
}
