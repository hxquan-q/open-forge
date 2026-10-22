// Modified by The Open Forge contributors.
import type { MemoryModelBudget } from "@vetta/runtime-memory";

/**
 * 自动抽取决策层（TASK-0380）：消费 0379 捕获队列的候选载荷，在明确
 * 配置的抽取 Provider 与预算约束下产出结构化建议（ADD/REVISE/RETRACT/
 * NOOP）；调用在事务外，提交前校验 scope/当前 revision/撤销纪元。
 *
 * 本模块是纯决策层：模型调用由注入的 ExtractorPort 承担（真实 Provider
 * 未授权时测试用确定性替身），不把助手推测/相似词/否定/计划当已验证事实。
 */

export type ExtractionSuggestionAction = "ADD" | "REVISE" | "RETRACT" | "NOOP";

export interface ExtractionSuggestion {
	readonly action: ExtractionSuggestionAction;
	readonly content: string;
	readonly scopeName: "user" | "project" | "task";
	/** 证据等级：自动抽取只能是 claimed（助手陈述）；工具验证需显式标记。 */
	readonly evidence: "claimed" | "tool-verified";
	readonly sourceId: string;
	/** REVISE/RETRACT 时的目标 memoryId 与期望 revision。 */
	readonly targetMemoryId?: string;
	readonly expectedRevision?: number;
}

export interface ExtractorPort {
	/** 确定性输入→建议；实现不得在事务内调用，不得改写候选。 */
	readonly extract: (payload: string) => Promise<readonly ExtractionSuggestion[]>;
}

/** 预算账本：单 job 输出与日请求数都受 memoryPolicy 预算约束。 */
export class ExtractionBudgetLedger {
	private readonly usedByDay = new Map<string, number>();

	constructor(private readonly budget: MemoryModelBudget) {}

	/** 今日是否还有预算；领取即计数（失败也计数——调用已发生）。 */
	claimRequest(day: string): boolean {
		if (this.budget.dailyRequestLimit === undefined) return true;
		const used = this.usedByDay.get(day) ?? 0;
		if (used >= this.budget.dailyRequestLimit) return false;
		this.usedByDay.set(day, used + 1);
		return true;
	}

	/** 输出条目数不超过 maxOutputTokens 对应的建议上限（保守：每条 40 token）。 */
	withinOutputLimit(suggestions: readonly ExtractionSuggestion[]): boolean {
		return suggestions.length <= Math.ceil(this.budget.maxOutputTokens / 40);
	}
}

/** 错误分类（重试策略输入）。 */
export type ExtractionErrorKind = "provider-transient" | "invalid-output" | "budget-exhausted";

export function classifyExtractionError(error: unknown): ExtractionErrorKind {
	if (error instanceof ExtractionBudgetExhaustedError) return "budget-exhausted";
	if (error instanceof InvalidExtractionOutputError) return "invalid-output";
	return "provider-transient";
}

export class ExtractionBudgetExhaustedError extends Error {
	constructor() {
		super("抽取预算耗尽（extraction budget exhausted）");
		this.name = "ExtractionBudgetExhaustedError";
	}
}

export class InvalidExtractionOutputError extends Error {
	constructor(reason: string) {
		super(`抽取输出非法：${reason}`);
		this.name = "InvalidExtractionOutputError";
	}
}

/** 对建议做提交前校验：scope 合法、目标存在、revision 匹配；不合法降为 NOOP+理由。 */
export function validateSuggestion(
	suggestion: ExtractionSuggestion,
	context: {
		readonly allowedScopes: readonly string[];
		readonly currentRevisions: ReadonlyMap<string, number>;
	},
): ExtractionSuggestion {
	if (!context.allowedScopes.includes(suggestion.scopeName)) {
		return { ...suggestion, action: "NOOP" };
	}
	if (suggestion.action === "REVISE" || suggestion.action === "RETRACT") {
		const target = suggestion.targetMemoryId ?? "";
		const current = context.currentRevisions.get(target);
		if (current === undefined || suggestion.expectedRevision !== current) {
			return { ...suggestion, action: "NOOP" };
		}
	}
	if (suggestion.action === "ADD" && suggestion.content.trim() === "") {
		return { ...suggestion, action: "NOOP" };
	}
	// 自动抽取不授予高证据等级：tool-verified 必须来自显式标记（当前切片一律降级）。
	if (suggestion.evidence === "tool-verified") {
		return { ...suggestion, evidence: "claimed" };
	}
	return suggestion;
}

/** 建议去重与合并：同 content 多来源只保留一条（合并 sourceId 语义由存储层多来源承担）。 */
export function mergeSuggestions(suggestions: readonly ExtractionSuggestion[]): readonly ExtractionSuggestion[] {
	const seen = new Set<string>();
	const merged: ExtractionSuggestion[] = [];
	for (const suggestion of suggestions) {
		if (suggestion.action === "NOOP") continue;
		const key = `${suggestion.action}:${suggestion.scopeName}:${suggestion.content}`;
		if (seen.has(key)) continue;
		seen.add(key);
		merged.push(suggestion);
	}
	return merged;
}

export interface AutomaticExtractionRunnerOptions {
	readonly extractor: ExtractorPort;
	readonly budget: MemoryModelBudget;
	readonly allowedScopes: readonly string[];
	readonly now?: () => { readonly iso: string; readonly day: string };
}

export class AutomaticExtractionRunner {
	private readonly ledger: ExtractionBudgetLedger;

	constructor(private readonly options: AutomaticExtractionRunnerOptions) {
		this.ledger = new ExtractionBudgetLedger(options.budget);
	}

	/**
	 * 处理一个捕获 job：预算检查 →（事务外）抽取 → 输出校验/预算 →
	 * 建议校验/合并。失败按错误分类上抛，由队列层记录 attempt。
	 */
	async run(
		job: { readonly payload: string },
		context: { readonly currentRevisions: ReadonlyMap<string, number> },
	): Promise<readonly ExtractionSuggestion[]> {
		const now = this.options.now?.() ?? { iso: new Date().toISOString(), day: new Date().toISOString().slice(0, 10) };
		if (!this.ledger.claimRequest(now.day)) {
			throw new ExtractionBudgetExhaustedError();
		}
		const raw = await this.options.extractor.extract(job.payload);
		if (!Array.isArray(raw)) {
			throw new InvalidExtractionOutputError("输出必须是建议数组");
		}
		for (const suggestion of raw) {
			if (
				typeof suggestion?.content !== "string" ||
				(suggestion.action !== "NOOP" && suggestion.content.trim() === "" && suggestion.action === "ADD")
			) {
				throw new InvalidExtractionOutputError("建议缺少内容");
			}
		}
		if (!this.ledger.withinOutputLimit(raw)) {
			throw new InvalidExtractionOutputError("输出超出单 job 上限");
		}
		const validated = raw.map((suggestion) =>
			validateSuggestion(suggestion, {
				allowedScopes: this.options.allowedScopes,
				currentRevisions: context.currentRevisions,
			}),
		);
		return mergeSuggestions(validated);
	}
}
