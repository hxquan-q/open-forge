// Modified by The Open Forge contributors.
import type { AgentTeamDocument } from "@vetta/agent-team";

/**
 * 新会话目标的委任分类（REQ-0034 统一模型，渲染层路由用）：
 * - worker 型 agent（档案带 lifecycle 标记）→ 走普通会话链路，主进程折算成委任束；
 * - 无主控团队（**队长**档案带标记）→ 同上，整队按机组调度；
 * - 有主控团队（队长未标记）→ 维持 Team 会话编排（现状）。
 *
 * 分类在渲染层做是为了决定**发送路由**（普通会话 vs Team 会话）；主进程仍是
 * 语义权威——它按同一份文档重新解析成员与指引，不信任渲染层的结论。
 */

/** 团队是否无主控：队长档案带生命周期标记。团队/档案缺失按有主控处理（保守回落现状）。 */
export function isWorkerTeam(document: AgentTeamDocument | undefined, teamId: string | null): boolean {
	if (!document || !teamId) return false;
	const team = document.teams.find((candidate) => candidate.id === teamId);
	if (!team) return false;
	const leader = team.members.find((member) => member.id === team.leaderMemberId) ?? team.members[0];
	if (!leader) return false;
	const leaderProfile = document.agents.find((profile) => profile.id === leader.binding.agentProfileId);
	return leaderProfile?.lifecycle !== undefined;
}

/** 单个智能体是否 worker 型（档案带生命周期标记）；档案缺失按主控处理。 */
export function isWorkerAgent(document: AgentTeamDocument | undefined, agentProfileId: string | null): boolean {
	if (!document || !agentProfileId) return false;
	return document.agents.find((profile) => profile.id === agentProfileId)?.lifecycle !== undefined;
}
