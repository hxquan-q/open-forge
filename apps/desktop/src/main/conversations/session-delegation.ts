// Modified by The Open Forge contributors.
import type { AgentBlueprint, AgentProfile, AgentTeamDocument, TeamDefinition, TeamMember } from "@vetta/agent-team";
import { type CodingAgentDelegatedMember, delegatedMemberTypeId } from "@vetta/coding-agent/composition";
import { resolveAgentBlueprint } from "../agent-teams/agent-blueprint-registry.js";

/** 团队委任在会话绑定记录里的身份前缀（agent-bindings.json 的值域扩展）。 */
export const DELEGATION_TEAM_BINDING_PREFIX = "team:";

export function delegationTeamBinding(teamId: string): string {
	return `${DELEGATION_TEAM_BINDING_PREFIX}${teamId}`;
}

export function parseDelegationTeamBinding(value: string | undefined): string | undefined {
	if (!value?.startsWith(DELEGATION_TEAM_BINDING_PREFIX)) return undefined;
	const teamId = value.slice(DELEGATION_TEAM_BINDING_PREFIX.length).trim();
	return teamId.length > 0 ? teamId : undefined;
}

/**
 * 按档案解析单个 worker 成员定义。
 * 档案缺失 systemPrompt 且 blueprint 也提供不了时返回 undefined——没有 persona 的
 * 成员无从委派，调用方跳过而不是让会话创建失败。
 */
export function resolveDelegatedMember(
	profile: AgentProfile,
	options?: { readonly instructions?: string },
): CodingAgentDelegatedMember | undefined {
	const blueprint = resolveAgentBlueprint(profile.blueprintId);
	const systemPrompt = profile.systemPrompt ?? blueprint?.systemPrompt;
	if (!systemPrompt) return undefined;
	const skillNames = resolveMemberSkillNames(profile, blueprint);
	return {
		id: profile.id,
		name: profile.name,
		description: profile.description?.trim() || profile.name,
		systemPrompt,
		...(options?.instructions ? { instructions: options.instructions } : {}),
		lifecycle: requireLifecycle(profile),
		...(skillNames ? { skillNames } : {}),
	};
}

/**
 * 成员技能白名单：档案勾选的 skills（custom 选择模式）。
 * `all` 模式与空选都返回 undefined（继承父会话技能面）——all 的语义是"随全局能力走"，
 * 白名单化会在新装技能时悄悄把成员锁死在旧集合。
 */
function resolveMemberSkillNames(
	profile: AgentProfile,
	blueprint: AgentBlueprint | undefined,
): readonly string[] | undefined {
	if (profile.abilities.selectionMode === "all") return undefined;
	const skills = profile.abilities.skills.filter((name) => name.length > 0);
	// 空选 + blueprint 无默认 = 没有任何技能主张，交回继承而不是 allow 空（等于禁技能）。
	if (skills.length > 0) return skills;
	const defaults = blueprint?.defaultAbilities.skills ?? [];
	return defaults.length > 0 ? defaults : undefined;
}

function requireLifecycle(profile: AgentProfile): "resident" | "oneshot" {
	// 调用方已按 lifecycle 标记筛过 worker；此处收口为编译器可见的收窄。
	return profile.lifecycle === "oneshot" ? "oneshot" : "resident";
}

export interface ResolvedTeamDelegation {
	readonly team: TeamDefinition;
	/** worker 成员定义（主控型成员不进叶子位，见配套规则）。 */
	readonly members: readonly CodingAgentDelegatedMember[];
	/** 团队里未标记 lifecycle 的成员（主控型）：指引中声明不可委派、建议整会话接管。 */
	readonly controllerMembers: readonly { readonly name: string; readonly description: string }[];
}

/**
 * 解析一支团队的委任面：仅带 lifecycle 标记的成员进入可委派集；队长未标记（有主控团队）
 * 由调用方先行判断并走 Team 会话，正常不会到达这里。
 * 成员档案/blueprint 解析不到时跳过该成员（降级发布），与团队编辑器"提供方不在场"语义一致。
 */
export function resolveTeamDelegation(document: AgentTeamDocument, team: TeamDefinition): ResolvedTeamDelegation {
	const profiles = new Map(document.agents.map((profile) => [profile.id, profile]));
	const members: CodingAgentDelegatedMember[] = [];
	const controllerMembers: ResolvedTeamDelegation["controllerMembers"] = [];
	for (const member of team.members) {
		const profile = profiles.get(member.binding.agentProfileId);
		if (!profile) continue;
		if (!profile.lifecycle) {
			controllerMembers.push({
				name: profile.name,
				description: member.assignment?.responsibility ?? profile.description ?? "",
			});
			continue;
		}
		const delegated = resolveDelegatedMember(profile, {
			instructions: teamMemberInstructions(member),
		});
		if (delegated) members.push(delegated);
	}
	return { team, members, controllerMembers };
}

/** 团队任务书：成员 instructions；队长的 assignment.responsibility 作为域描述并入指引。 */
function teamMemberInstructions(member: TeamMember): string | undefined {
	return member.assignment?.instructions?.trim() || undefined;
}

/**
 * 委派指引（系统提示词 addon）：告诉驾驶会话机组怎么用——域匹配、生命周期纪律、
 * 兜底与并行规则。英文书写（系统提示词语言，非用户可见 UI 文案）。
 */
export function buildDelegationSystemPrompt(input: {
	readonly members: readonly CodingAgentDelegatedMember[];
	readonly controllerMembers?: readonly { readonly name: string; readonly description: string }[];
	readonly teamName?: string;
}): string {
	const roster = input.members.map((member) => {
		const lines = [
			`- ${member.name} — agent_type: "${delegatedMemberTypeId(member.id)}"`,
			`  domain: ${member.description}`,
		];
		if (member.lifecycle === "resident") {
			lines.push(
				`  lifecycle: resident. Spawn once with task_name="${memberTaskName(member)}"; route every later task for this member through followup_task(target="${memberTaskName(member)}"). Never spawn a second instance (the tool enforces this).`,
			);
		} else {
			lines.push("  lifecycle: oneshot. Spawn a fresh instance per task with a unique task_name.");
		}
		return lines.join("\n");
	});
	const controllerNote =
		input.controllerMembers && input.controllerMembers.length > 0
			? [
					"",
					"## Controller-type members (not delegatable as leaves)",
					input.controllerMembers.map((member) => `- ${member.name}: ${member.description}`).join("\n"),
					"These members are orchestration-style personas and must never be placed in a leaf worker position. If the user's request clearly needs one of them to run the whole session, say so and suggest starting a dedicated session with that member (or its team) selected.",
				].join("\n")
			: "";
	return [
		"# Crew delegation",
		input.teamName
			? `This session is staffed with the crew of "${input.teamName}". You remain the driver: plan, answer, and do light work yourself; delegate when a task falls inside a crew member's domain.`
			: "This session is staffed with a specialist crew member. You remain the driver: plan, answer, and do light work yourself; delegate when a task falls inside the member's domain.",
		"",
		"## Crew roster",
		roster.join("\n"),
		"",
		"## Delegation rules",
		"- Match the task to a member by its domain description; when in doubt or outside every domain, do it yourself or spawn a `general` subagent (the fallback).",
		"- Delegate with a full structured task contract (history / current_state / objective / scope / constraints / relevant_context / deliverables / validation). Constraints must state the write boundary for this task.",
		"- Tasks for the same resident member run strictly in order: one follow-up at a time, wait for its result before queuing the next.",
		"- Run members in parallel only when the user explicitly asks for it; default is sequential.",
		"- Do not mirror a member's persona yourself and do not answer on its behalf; delegate and report its verified results.",
		controllerNote,
	]
		.filter((section) => section !== "")
		.join("\n");
}

/** resident 成员的稳定 task_name：`m_<id 归一>`（task_name 词法不接受连字符/大写）。 */
export function memberTaskName(member: CodingAgentDelegatedMember): string {
	return `m_${
		member.id
			.replace(/[^a-zA-Z0-9_]/g, "_")
			.replace(/^_+/, "")
			.toLowerCase() || "member"
	}`;
}
