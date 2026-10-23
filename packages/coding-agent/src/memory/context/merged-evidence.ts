// Copyright The Open Forge contributors.
import type { ContextProvider } from "@vetta/runtime-core/kernel";
import type { MemoryRevision, MemoryScope } from "@vetta/runtime-memory";
import { allocateInjection, type InjectionBudget } from "./injection-budget.js";
import { type MemoryEvidenceBudget, renderMemoryEvidenceBlock } from "./memory-evidence-context.js";

/**
 * 合并作用域证据注入（BUG-0149/R5）：user 全局偏好与当前 project 证据
 * 共同进入有界上下文。预算分配经 allocateInjection（pin 占额、
 * user/project 各保底 2 条），渲染仍是「数据非指令」的证据块；Turn 内
 * 快照固定，遗忘在下一请求快照前被存储层过滤。
 */

export interface MergedMemoryEvidenceReader {
	readonly readEvidence: (scope: MemoryScope) => Promise<readonly MemoryRevision[]>;
}

export function createMergedMemoryEvidenceProvider(options: {
	readonly providerId?: string;
	readonly scopes: readonly MemoryScope[];
	readonly reader: MergedMemoryEvidenceReader;
	readonly budget?: InjectionBudget;
	readonly renderBudget?: MemoryEvidenceBudget;
}): ContextProvider {
	const providerId = options.providerId ?? "coding-agent.memory-evidence";
	return {
		id: providerId,
		provide: async (_input, signal) => {
			signal.throwIfAborted();
			const perScope = await Promise.all(
				options.scopes.map(async (scope) => {
					const entries = [...(await options.reader.readEvidence(scope))];
					// pinned 稳定在前；动态区按 recordedAt 倒序。
					entries.sort((left, right) => (right.recordedAt > left.recordedAt ? 1 : -1));
					const pinned = entries.filter((entry) => entry.pinned === true);
					const dynamic = entries.filter((entry) => entry.pinned !== true);
					return { pinned, dynamic };
				}),
			);
			const injected = allocateInjection({
				pinned: perScope.flatMap((entry) => entry.pinned),
				dynamic: perScope.flatMap((entry) => entry.dynamic),
				...(options.budget === undefined ? {} : { budget: options.budget }),
			});
			const text = renderMemoryEvidenceBlock(
				injected,
				options.renderBudget ??
					(options.budget === undefined
						? undefined
						: { maxEntries: options.budget.maxEntries, maxChars: options.budget.maxChars }),
			);
			return text === ""
				? []
				: [{ role: "user" as const, content: [{ type: "text" as const, text }], timestamp: Date.now() }];
		},
	};
}
