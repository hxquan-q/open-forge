// Modified by The Open Forge contributors.
/**
 * 委任成员定义（REQ-0034）：宿主从 Agent Profile / 团队成员解析出的声明式数据，
 * 随会话配置下发；内核据此为该会话动态注册子代理类型（persona + 技能面 + 生命周期）。
 *
 * 这是宿主 → 内核的合同边界：只承载数据，不承载行为；首次进入边界时结构校验。
 */
export type CodingAgentDelegatedMemberLifecycle = "resident" | "oneshot";

export interface CodingAgentDelegatedMember {
	/** 成员稳定 id（档案/blueprint id）；用于推导子代理类型 id `member:<id>`。 */
	readonly id: string;
	/** 展示名：子代理快照 title 与 UI 呈现（「UI 顶栏呈现成员名」）。 */
	readonly name: string;
	/** 域描述：驾驶会话据此判断任务是否落在该成员域内。 */
	readonly description: string;
	/** persona 本体（成员 systemPrompt）。内核在其外层包裹 leaf-worker 框架。 */
	readonly systemPrompt: string;
	/** 团队内任务书（可选）：追加在 persona 之后的团队交待。 */
	readonly instructions?: string;
	/**
	 * 生命周期：`resident` 常驻（spawn 一次 durable 会话，后续任务 followup_task
	 * 顺序排队，绝不重复起实例）；`oneshot` 一次性（每个任务按定义起 one-shot）。
	 */
	readonly lifecycle: CodingAgentDelegatedMemberLifecycle;
	/** 技能白名单；缺省（或空数组）继承父会话技能面。 */
	readonly skillNames?: readonly string[];
}

export const MAX_DELEGATED_MEMBERS_PER_SESSION = 16;

/** 委任成员的子代理类型 id 前缀；与内置 general/explorer/workflow 隔离。 */
export const DELEGATED_MEMBER_TYPE_PREFIX = "member:";

export function delegatedMemberTypeId(memberId: string): string {
	return `${DELEGATED_MEMBER_TYPE_PREFIX}${memberId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, field: string, maxLength: number): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`Delegated member field ${field} must be a non-empty string`);
	}
	if (value.length > maxLength) {
		throw new Error(`Delegated member field ${field} exceeds ${maxLength} characters`);
	}
	return value;
}

/**
 * 结构校验 + 归一：拒绝未知结构、空 persona、非法生命周期与重复 id。
 * 在会话配置解析边界调用；抛错即创建失败（fail closed）。
 */
export function parseDelegatedMembers(value: unknown): readonly CodingAgentDelegatedMember[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) {
		throw new Error("Coding Agent Runtime Session field delegatedMembers must be an array");
	}
	if (value.length > MAX_DELEGATED_MEMBERS_PER_SESSION) {
		throw new Error(`delegatedMembers exceeds ${MAX_DELEGATED_MEMBERS_PER_SESSION} entries`);
	}
	const members: CodingAgentDelegatedMember[] = [];
	const seenIds = new Set<string>();
	for (const raw of value) {
		if (!isRecord(raw)) throw new Error("delegatedMembers entries must be objects");
		const id = requireNonEmptyString(raw.id, "id", 256);
		if (seenIds.has(id)) throw new Error(`Duplicate delegated member id: ${id}`);
		seenIds.add(id);
		const lifecycle = raw.lifecycle;
		if (lifecycle !== "resident" && lifecycle !== "oneshot") {
			throw new Error(`Delegated member "${id}" field lifecycle must be "resident" or "oneshot"`);
		}
		const skillNames = raw.skillNames === undefined ? undefined : parseSkillNames(raw.skillNames, id);
		const instructions =
			raw.instructions === undefined ? undefined : requireNonEmptyString(raw.instructions, "instructions", 32_768);
		members.push({
			id,
			name: requireNonEmptyString(raw.name, "name", 128),
			description: requireNonEmptyString(raw.description, "description", 2_048),
			systemPrompt: requireNonEmptyString(raw.systemPrompt, "systemPrompt", 64_000),
			...(instructions ? { instructions } : {}),
			lifecycle,
			...(skillNames && skillNames.length > 0 ? { skillNames } : {}),
		});
	}
	return members;
}

function parseSkillNames(value: unknown, memberId: string): readonly string[] | undefined {
	if (!Array.isArray(value)) {
		throw new Error(`Delegated member "${memberId}" field skillNames must be an array`);
	}
	if (value.length > 256) {
		throw new Error(`Delegated member "${memberId}" field skillNames exceeds 256 entries`);
	}
	return value.map((name) => requireNonEmptyString(name, "skillNames", 256));
}
