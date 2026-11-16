// Modified by The Open Forge contributors.
import {
	type SubagentTypeDefinition,
	SubagentTypeRegistry,
	type SubagentTypeRegistryLike,
} from "@vetta/runtime-subagents";
import { type CodingAgentDelegatedMember, delegatedMemberTypeId } from "../contracts/delegated-members.js";
import type { CodingAgentSubagentProfile } from "../contracts/index.js";

/**
 * 把委任成员定义装配成子代理类型：persona 外包裹 leaf-worker 框架，技能面按白名单收窄，
 * 其余继承父会话（与 general 型一致），生命周期标记随 profile 供 spawn 守卫消费。
 */
export function createDelegatedMemberSubagentType(
	member: CodingAgentDelegatedMember,
): SubagentTypeDefinition<CodingAgentSubagentProfile> {
	return {
		id: delegatedMemberTypeId(member.id),
		label: member.name,
		displayTitle: member.name,
		description: `Delegated crew member: ${member.description}`,
		profile: {
			toolPolicy: { mode: "inherit" },
			mcpPolicy: { mode: "inherit" },
			skillPolicy:
				member.skillNames && member.skillNames.length > 0
					? { mode: "allow", names: [...member.skillNames] }
					: { mode: "inherit" },
			contextPolicy: { mode: "full" },
			todoPolicy: { mode: "enabled" },
			workspacePolicy: { mode: "shared" },
			systemPromptAddon: renderDelegatedMemberPrompt(member),
			delegation: { lifecycle: member.lifecycle },
		},
	};
}

/**
 * 为本会话构建子代理类型注册表：复制基础类型（general/explorer/workflow 或宿主提供集），
 * 再覆盖成员类型。刻意新建注册表而不是原地 upsert——基础注册表可能是组合级共享对象，
 * 会话级成员一旦写入会跨会话泄漏。
 */
export function createSessionDelegatedMemberTypeRegistry(
	base: SubagentTypeRegistryLike<CodingAgentSubagentProfile>,
	delegatedMembers: readonly CodingAgentDelegatedMember[] | undefined,
): SubagentTypeRegistry<CodingAgentSubagentProfile> {
	const registry = new SubagentTypeRegistry<CodingAgentSubagentProfile>();
	for (const type of base.list()) registry.register(type);
	for (const member of delegatedMembers ?? []) {
		registry.upsert(createDelegatedMemberSubagentType(member));
	}
	return registry;
}

/**
 * 成员子代理系统提示词：persona 本体 + 团队任务书 + leaf-worker 纪律。
 * 纪律框架与 general 型对齐（不委派、按契约交付、验证后汇报），保证主控型人设
 * 进入叶子位后不会尝试编排整场会话。
 */
function renderDelegatedMemberPrompt(member: CodingAgentDelegatedMember): string {
	return [
		`You are ${member.name}, a specialist crew member working as a leaf subagent for a parent session.`,
		"",
		"## Identity",
		member.systemPrompt.trim(),
		...(member.instructions
			? [
					"",
					"## Team brief",
					"The parent's crew roster adds the following team-specific instructions:",
					member.instructions.trim(),
				]
			: []),
		"",
		"## Delegation discipline",
		"- You are a leaf worker: never spawn agents, never delegate, never orchestrate other members.",
		"- Complete the delegated task contract independently and stay inside its stated scope; report ambiguity or blockers to the parent instead of widening scope.",
		"- Verify observable behavior with the requested checks before claiming completion.",
		"- Other work may be happening concurrently. Do not overwrite unrelated changes.",
		"- Use report_to_parent for actionable progress, blockers, and completed validation while you work.",
		"- End with a concise structured report: outcome, files or artifacts changed, validation actually run, remaining risks, and any blocker.",
	].join("\n");
}
