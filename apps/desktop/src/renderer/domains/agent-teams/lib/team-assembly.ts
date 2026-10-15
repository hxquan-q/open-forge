import type {
	AgentProfile,
	CreateTeamInput,
	CreateTeamMemberInput,
	TeamDefinition,
	TeamMemberAssignment,
	UpdateTeamInput,
	UpdateTeamMemberInput,
} from "@vetta/agent-team";
import { DEFAULT_TEAM_AUTOMATIC_RETRIES, isTeamRetryLimit } from "@vetta/agent-team";

/**
 * 「拉拢」编队时的草稿。它只按 Agent 身份记录阵容，成员绑定与 leader 归属
 * 在提交时才折算成 Team 协议输入，避免 UI state 混入协议细节。
 */
export interface TeamAssemblyDraft {
	/** 有值表示在改已有团队的阵容，无值表示新建。 */
	readonly teamId?: string;
	readonly name: string;
	readonly description?: string;
	readonly maxAutomaticRetries?: number;
	readonly memberIds: readonly string[];
	/** 队长的 Agent Profile ID；成员被移除时自动顺延到第一位。 */
	readonly leaderId?: string;
	/** 新成员的绑定方式，缺省为跟随智能体库的 `reference`。 */
	readonly bindingKinds?: Readonly<Record<string, "reference" | "copy">>;
	/** 成员在本团队内的任务书，按 Agent 身份存放；空白字段由主进程折算成缺省。 */
	readonly assignments?: Readonly<Record<string, TeamMemberAssignment>>;
	/** 成员的队内称呼覆盖，按 Agent 身份存放；与现值相同（trim 后）时提交不携带。 */
	readonly handles?: Readonly<Record<string, string>>;
}

export function emptyAssemblyDraft(): TeamAssemblyDraft {
	return { name: "", memberIds: [], leaderId: undefined };
}

export function assemblyDraftFromTeam(team: TeamDefinition): TeamAssemblyDraft {
	const memberIds = team.members.map((member) => member.binding.agentProfileId);
	const leader = team.members.find((member) => member.id === team.leaderMemberId);
	const assignments = Object.fromEntries(
		team.members.flatMap((member) => (member.assignment ? [[member.binding.agentProfileId, member.assignment]] : [])),
	);
	const handles = Object.fromEntries(team.members.map((member) => [member.binding.agentProfileId, member.handle]));
	return {
		teamId: team.id,
		name: team.name,
		description: team.description,
		maxAutomaticRetries: team.maxAutomaticRetries ?? DEFAULT_TEAM_AUTOMATIC_RETRIES,
		memberIds,
		leaderId: leader?.binding.agentProfileId ?? memberIds[0],
		assignments,
		handles,
	};
}

/** 写入或清空某位成员的任务书；两个字段都空时整条移除，草稿里不留空壳。 */
export function setAssemblyAssignment(
	draft: TeamAssemblyDraft,
	agentId: string,
	assignment: TeamMemberAssignment,
): TeamAssemblyDraft {
	const responsibility = assignment.responsibility?.trim();
	const instructions = assignment.instructions?.trim();
	const { [agentId]: _removed, ...rest } = draft.assignments ?? {};
	if (!responsibility && !instructions) return { ...draft, assignments: rest };
	return {
		...draft,
		assignments: {
			...rest,
			[agentId]: { ...(responsibility ? { responsibility } : {}), ...(instructions ? { instructions } : {}) },
		},
	};
}

export function assemblyAssignment(draft: TeamAssemblyDraft, agentId: string): TeamMemberAssignment | undefined {
	return draft.assignments?.[agentId];
}

/** 点击卡片即拉入或移出；移出队长时把队长顺延给剩下的第一位。 */
export function toggleAssemblyMember(draft: TeamAssemblyDraft, agentId: string): TeamAssemblyDraft {
	if (!draft.memberIds.includes(agentId)) {
		return {
			...draft,
			memberIds: [...draft.memberIds, agentId],
			leaderId: draft.leaderId ?? agentId,
		};
	}
	const memberIds = draft.memberIds.filter((id) => id !== agentId);
	return {
		...draft,
		memberIds,
		leaderId: draft.leaderId === agentId ? memberIds[0] : draft.leaderId,
	};
}

export function assemblyLeaderId(draft: TeamAssemblyDraft): string | undefined {
	return draft.leaderId && draft.memberIds.includes(draft.leaderId) ? draft.leaderId : draft.memberIds[0];
}

/**
 * 组队草稿进入时的种子：新建是空草稿，编辑既有团队是按团队重放的快照。
 * 与当前草稿比对得出「用户是否真的改过」，决定点空白能否静默退出。
 */
export function assemblyBaseline(
	draft: TeamAssemblyDraft,
	teams: readonly TeamDefinition[],
): TeamAssemblyDraft | undefined {
	if (!draft.teamId) return emptyAssemblyDraft();
	const team = teams.find((candidate) => candidate.id === draft.teamId);
	return team ? assemblyDraftFromTeam(team) : undefined;
}

/** 草稿相对种子是否有实质改动；trim 后等价视为未改（名字里敲过空格不算改动）。 */
export function sameAssemblyDraft(a: TeamAssemblyDraft, b: TeamAssemblyDraft): boolean {
	return (
		a.teamId === b.teamId &&
		a.name.trim() === b.name.trim() &&
		(a.description?.trim() ?? "") === (b.description?.trim() ?? "") &&
		a.maxAutomaticRetries === b.maxAutomaticRetries &&
		a.leaderId === b.leaderId &&
		sameOrderedIds(a.memberIds, b.memberIds) &&
		sameRecord(a.bindingKinds, b.bindingKinds, (x, y) => x === y) &&
		sameRecord(a.handles, b.handles, (x, y) => x.trim() === y.trim()) &&
		sameRecord(a.assignments, b.assignments, sameAssignment)
	);
}

/** memberIds 的顺序本身是语义（顺延队长取首位），按序比对而非集合比对。 */
function sameOrderedIds(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((id, index) => id === b[index]);
}

function sameRecord<V>(
	a: Readonly<Record<string, V>> | undefined,
	b: Readonly<Record<string, V>> | undefined,
	equal: (x: V, y: V) => boolean,
): boolean {
	const left = a ?? {};
	const right = b ?? {};
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) return false;
	return leftKeys.every((key) => key in right && equal(left[key], right[key]));
}

function sameAssignment(a: TeamMemberAssignment, b: TeamMemberAssignment): boolean {
	return (
		(a.responsibility?.trim() ?? "") === (b.responsibility?.trim() ?? "") &&
		(a.instructions?.trim() ?? "") === (b.instructions?.trim() ?? "")
	);
}

export function canSubmitAssembly(draft: TeamAssemblyDraft): boolean {
	return (
		draft.name.trim().length > 0 &&
		draft.memberIds.length > 0 &&
		(draft.maxAutomaticRetries === undefined || isTeamRetryLimit(draft.maxAutomaticRetries))
	);
}

export function buildCreateTeamInput(
	draft: TeamAssemblyDraft,
	agentsById: ReadonlyMap<string, AgentProfile>,
): CreateTeamInput {
	const leaderId = assemblyLeaderId(draft);
	const members: CreateTeamMemberInput[] = [];
	const usedHandles = new Set<string>();
	for (const agentId of draft.memberIds) {
		const agent = agentsById.get(agentId);
		if (!agent) continue;
		members.push({
			agentProfileId: agent.id,
			handle: uniqueHandle(agent.mentionHandle, usedHandles),
			bindingKind: bindingKindFor(draft, agent.id),
			leader: agent.id === leaderId,
			...(draft.assignments?.[agent.id] ? { assignment: draft.assignments[agent.id] } : {}),
		});
	}
	return {
		name: draft.name.trim(),
		description: draft.description?.trim() ?? "",
		members,
		...(draft.maxAutomaticRetries !== undefined ? { maxAutomaticRetries: draft.maxAutomaticRetries } : {}),
	};
}

export function buildUpdateTeamInput(
	draft: TeamAssemblyDraft,
	team: TeamDefinition,
	agentsById: ReadonlyMap<string, AgentProfile>,
): UpdateTeamInput {
	const leaderId = assemblyLeaderId(draft);
	const existingByAgentId = new Map(team.members.map((member) => [member.binding.agentProfileId, member]));
	const members: UpdateTeamMemberInput[] = [];
	for (const agentId of draft.memberIds) {
		if (!agentsById.has(agentId)) continue;
		const existing = existingByAgentId.get(agentId);
		members.push(
			existing
				? {
						kind: "existing",
						memberId: existing.id,
						leader: agentId === leaderId,
						...handleInput(draft, agentId, existing.handle),
						...assignmentInput(draft, agentId),
					}
				: {
						kind: "new",
						agentProfileId: agentId,
						bindingKind: bindingKindFor(draft, agentId),
						leader: agentId === leaderId,
						...assignmentInput(draft, agentId),
					},
		);
	}
	return {
		expectedRevision: team.revision,
		...(draft.maxAutomaticRetries !== undefined ? { maxAutomaticRetries: draft.maxAutomaticRetries } : {}),
		name: draft.name.trim(),
		description: draft.description?.trim() ?? team.description,
		members,
	};
}

/**
 * 改团队时任务书始终随编队一起提交：草稿里没有就发空对象表示「清空」。
 * 省略字段在协议里表示「本次没碰任务书」，会让删除任务书永远保存不上。
 */
function assignmentInput(draft: TeamAssemblyDraft, agentId: string): { readonly assignment: TeamMemberAssignment } {
	return { assignment: draft.assignments?.[agentId] ?? {} };
}

/**
 * 队内称呼与任务书不同：它没有「清空」语义，未改动就不携带——省略在协议里表示
 * 「本次没碰」，携带同值只会白增一次无意义的写入面。
 */
function handleInput(
	draft: TeamAssemblyDraft,
	agentId: string,
	currentHandle: string,
): { readonly handle: string } | Record<string, never> {
	const next = draft.handles?.[agentId]?.trim();
	if (!next || next === currentHandle) return {};
	return { handle: next };
}

function bindingKindFor(draft: TeamAssemblyDraft, agentId: string): "reference" | "copy" {
	return draft.bindingKinds?.[agentId] ?? "reference";
}

function uniqueHandle(handle: string, used: Set<string>): string {
	let candidate = handle;
	for (let suffix = 2; used.has(candidate); suffix += 1) candidate = `${handle}-${suffix}`;
	used.add(candidate);
	return candidate;
}
