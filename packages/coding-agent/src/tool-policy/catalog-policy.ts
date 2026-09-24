// Copyright The Open Forge contributors.
/**
 * 单一 Catalog 收敛规则（TASK-0021）：Profile 默认 × 显式选择 × 项目策略。
 *
 * 只决定「模型能看见哪些工具」（Catalog/schema 可见面）；逐次执行授权
 * 永远由 TASK-0016 的风险分级与审批拥有——Catalog 可见不替代 grant/risk。
 *
 * 优先级（收紧方向单调）：
 * 1. 显式选择（用户/宿主）优先于 Profile 默认；
 * 2. 项目策略的 deny 永远生效（只能收紧不能放宽），对任何来源胜出；
 * 3. Profile 默认与项目 deny 取交集后若为空，Catalog 为空（最小集合）。
 */

export interface CatalogPolicyInput {
	/** Profile 默认工具名集合；`null` = 不设默认（全量由宿主面决定）。 */
	readonly profileDefaultToolNames: readonly string[] | null;
	/** 用户/宿主的显式选择；`undefined` = 未选（沿用默认），`[]` = 刻意禁用全部。 */
	readonly explicitToolNames: readonly string[] | undefined;
	/** 项目策略（.vetta/policies）声明的拒绝清单；只能收紧。 */
	readonly projectDeniedToolNames: readonly string[] | undefined;
}

export interface ResolvedCatalogPolicy {
	/** 进入模型 schema 的工具名集合；undefined = 不设置覆盖（沿用宿主全量默认）。 */
	readonly toolNames: readonly string[] | undefined;
	readonly source: "explicit" | "profile" | "project-deny-only" | "unset";
}

export function resolveToolCatalogPolicy(input: CatalogPolicyInput): ResolvedCatalogPolicy {
	const denied = input.projectDeniedToolNames ? new Set(input.projectDeniedToolNames) : undefined;
	if (input.explicitToolNames !== undefined) {
		return {
			toolNames: applyDeny(input.explicitToolNames, denied),
			source: "explicit",
		};
	}
	if (input.profileDefaultToolNames !== null) {
		return {
			toolNames: applyDeny(input.profileDefaultToolNames, denied),
			source: "profile",
		};
	}
	if (denied) {
		// 无 Profile 默认、无显式选择，但项目策略有拒绝：不能表达「全集减 deny」，
		// 此时保持 unset 并交由执行面（模型面 schema 由宿主装配，审批面按风险拦截）；
		// 项目策略对未列入 deny 的能力不构成放宽。
		return { toolNames: undefined, source: "project-deny-only" };
	}
	return { toolNames: undefined, source: "unset" };
}

function applyDeny(names: readonly string[], denied: Set<string> | undefined): readonly string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const name of names) {
		if (denied?.has(name) || seen.has(name)) continue;
		seen.add(name);
		result.push(name);
	}
	return result;
}

/**
 * 同名能力冲突裁决：后注册不得静默覆盖先注册（TASK-0021「不能静默注册或
 * 覆盖同名能力」）。返回胜者与被拒绝方；宿主决定如何上报。
 */
export function resolveCapabilityNameConflict<T extends { readonly name: string }>(
	existing: T | undefined,
	incoming: T,
): { readonly winner: T; readonly rejected: T; readonly replaced: boolean } {
	if (!existing || existing.name !== incoming.name) {
		return { winner: incoming, rejected: incoming, replaced: false };
	}
	// 先到先得：既有能力保留，新注册被拒（不静默覆盖）。
	return { winner: existing, rejected: incoming, replaced: true };
}
