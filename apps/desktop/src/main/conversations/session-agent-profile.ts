// Modified by The Open Forge contributors.
import type { AgentTeamDocument } from "@vetta/agent-team";
import type { CodingAgentDelegatedMember } from "@vetta/coding-agent/composition";
import type { AgentConfigurationSelection } from "@vetta/coding-agent/profile";
import { toAgentConfigurationOverrides } from "../agent-teams/agent-ability-overrides.js";
import { pinnedAbilityContext, resolveAgentBlueprint } from "../agent-teams/agent-blueprint-registry.js";
import { buildDelegationSystemPrompt, resolveDelegatedMember, resolveTeamDelegation } from "./session-delegation.js";

/**
 * 会话绑定的 Agent 折算出的会话输入；能力裁剪始终在主进程完成，渲染层只传身份。
 *
 * 两种形态（REQ-0034）：
 * - `persona` 主控/接管型（现状）：档案人格作为 systemPromptVolatileAddon 叠加基座提示词，
 *   能力白名单随档案折算；
 * - `delegation` worker 型（档案带 lifecycle 标记）：会话保持默认驾驶，人格不进系统提示词，
 *   改为按成员定义注册可委派子代理类型 + 注入委派指引；团队绑定（`team:<id>`）同构。
 */
export type ResolvedSessionAgentProfile =
	| {
			readonly kind: "persona";
			readonly agentProfileId: string;
			readonly agentConfiguration: AgentConfigurationSelection;
			readonly systemPromptVolatileAddon: string;
	  }
	| {
			readonly kind: "delegation";
			readonly agentProfileId: string;
			readonly delegatedMembers: readonly CodingAgentDelegatedMember[];
			readonly systemPromptVolatileAddon: string;
	  }
	| {
			readonly kind: "team-delegation";
			readonly teamId: string;
			readonly delegatedMembers: readonly CodingAgentDelegatedMember[];
			readonly systemPromptVolatileAddon: string;
	  };

/**
 * 按 Agent Profile 身份解析出本次会话的人格或委任面。
 *
 * 与 Team 成员同源：persona 走 addon 而非替换（基座 Coding Agent 提示词保留），
 * 能力覆盖复用 {@link toAgentConfigurationOverrides}。每次打开会话都重新解析，
 * 因此改了 Agent 的技能 / MCP 勾选或生命周期标记，重开会话即生效。
 *
 * profile 不存在或无人格可用时返回 undefined，由调用方决定「新建即报错」还是「恢复则降级」。
 */
export async function resolveSessionAgentProfile(input: {
	readonly agentProfileId: string;
	readonly readDocument: () => Promise<AgentTeamDocument>;
}): Promise<ResolvedSessionAgentProfile | undefined> {
	const document = await input.readDocument();
	const profile = document.agents.find((candidate) => candidate.id === input.agentProfileId);
	if (!profile) return undefined;
	const blueprint = resolveAgentBlueprint(profile.blueprintId);
	const systemPrompt = profile.systemPrompt ?? blueprint?.systemPrompt;
	if (!systemPrompt) return undefined;
	if (profile.lifecycle) {
		const member = resolveDelegatedMember(profile);
		if (!member) return undefined;
		return {
			kind: "delegation",
			agentProfileId: profile.id,
			delegatedMembers: [member],
			systemPromptVolatileAddon: buildDelegationSystemPrompt({ members: [member] }),
		};
	}
	return {
		kind: "persona",
		agentProfileId: profile.id,
		agentConfiguration: {
			template: null,
			overrides: toAgentConfigurationOverrides(profile.abilities, pinnedAbilityContext(blueprint)),
		},
		systemPromptVolatileAddon: systemPrompt,
	};
}

/**
 * 按团队 id 解析无主控团队的委任面（队长带 lifecycle 标记）。
 * 团队不存在或没有任何可委派成员时返回 undefined，由调用方降级或报错。
 */
export async function resolveSessionTeamDelegation(input: {
	readonly teamId: string;
	readonly readDocument: () => Promise<AgentTeamDocument>;
}): Promise<ResolvedSessionAgentProfile | undefined> {
	const document = await input.readDocument();
	const team = document.teams.find((candidate) => candidate.id === input.teamId);
	if (!team) return undefined;
	const delegation = resolveTeamDelegation(document, team);
	if (delegation.members.length === 0) return undefined;
	return {
		kind: "team-delegation",
		teamId: team.id,
		delegatedMembers: delegation.members,
		systemPromptVolatileAddon: buildDelegationSystemPrompt({
			members: delegation.members,
			controllerMembers: delegation.controllerMembers,
			teamName: team.name,
		}),
	};
}
