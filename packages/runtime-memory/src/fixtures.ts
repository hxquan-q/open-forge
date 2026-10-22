// Modified by The Open Forge contributors.

import type { MemoryErasureState } from "./erasure.js";
import type { MemoryPolicyConfiguration } from "./policy.js";
import type { MemoryRevision } from "./records.js";
import type { MemoryScope, MemoryScopeIdentity } from "./scopes.js";
import type { MemorySourceReference } from "./sources.js";

/**
 * 共享合同 fixture（`@vetta/runtime-memory/fixtures` 子出口）：
 * Node 合同测试与产品侧（coding-agent/runtime-node）测试共同消费，
 * 保证两侧对「合法/非法输入」的判定一致。不含任何用户数据。
 */

export const FIXTURE_PRINCIPAL: MemoryScopeIdentity = { principalId: "principal-fixture-1" };
export const FIXTURE_PROJECT: MemoryScopeIdentity = {
	principalId: "principal-fixture-1",
	projectId: "project-fixture-a",
};

export const FIXTURE_USER_SCOPE: MemoryScope = { name: "user", identity: FIXTURE_PRINCIPAL };
export const FIXTURE_PROJECT_SCOPE: MemoryScope = { name: "project", identity: FIXTURE_PROJECT };

export const FIXTURE_POLICY_EXPLICIT: MemoryPolicyConfiguration = {
	mode: "explicit",
	allowedScopes: ["user", "project"],
};

export const FIXTURE_POLICY_AUTOMATIC: MemoryPolicyConfiguration = {
	mode: "automatic",
	allowedScopes: ["user", "project", "task"],
	extractionBudget: { model: "fixture-extractor/1", maxOutputTokens: 2048, dailyRequestLimit: 50 },
};

export function fixtureRevision(overrides: Partial<MemoryRevision> = {}): MemoryRevision {
	return {
		memoryId: "mem-fixture-1",
		revisionId: "rev-fixture-1",
		kind: "fact",
		content: "fixture：项目 A 使用 pnpm workspace 约定",
		scopeName: "project",
		status: "active",
		validFrom: "2026-01-01T00:00:00Z",
		validTo: "",
		recordedAt: "2026-01-02T00:00:00Z",
		supersedes: "",
		evidence: "user-confirmed",
		...overrides,
	};
}

export const FIXTURE_SOURCE: MemorySourceReference = {
	sourceId: "session/fixture/turn/1/entry/2",
	role: "user-input",
	contentHash: "fixture-hash-1",
	retainsExcerpt: false,
};

export const FIXTURE_ERASURE_EMPTY: MemoryErasureState = { erasureEpoch: 0, suppressedMemoryIds: [] };

export const FIXTURE_ERASURE_WITH_SUPPRESSION: MemoryErasureState = {
	erasureEpoch: 3,
	suppressedMemoryIds: ["mem-fixture-forgotten"],
};

/**
 * 非法输入样本（每项附违反的稳定错误码），供两侧边界测试逐一断言。
 */
export const FIXTURE_INVALID_POLICY_INPUTS: readonly { readonly label: string; readonly value: unknown }[] = [
	{ label: "非对象", value: "explicit" },
	{ label: "未知 mode", value: { mode: "always", allowedScopes: ["user"] } },
	{ label: "空 allowedScopes", value: { mode: "explicit", allowedScopes: [] } },
	{
		label: "automatic 缺预算",
		value: { mode: "automatic", allowedScopes: ["user"] },
	},
	{
		label: "explicit 携带采集预算",
		value: { mode: "explicit", allowedScopes: ["user"], extractionBudget: { model: "m", maxOutputTokens: 1 } },
	},
	{
		label: "预算 maxOutputTokens 非正",
		value: {
			mode: "automatic",
			allowedScopes: ["user"],
			extractionBudget: { model: "m", maxOutputTokens: 0 },
		},
	},
];
