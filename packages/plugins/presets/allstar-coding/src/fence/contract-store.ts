// Copyright The Open Forge contributors.
/**
 * ac-fence 契约登记表（ac-fence-spec §4）——内存 Map + state.md 落盘同步。
 *
 * 三个登记来源（§4.1，按序尝试）：
 *   1. PreToolUse(spawn_agent)（最早、信息最全）→ 契约入表（spawn 被 block 则不入表）
 *   2. SubagentStart → 回填 agentId
 *   3. state.md 同步（恢复场景）→ SubagentStart 后 fire-and-forget 兜底重建
 *
 * 生命周期（§4.2）：Map 常驻内存（插件生命周期 = desktop 进程生命周期）；不主动清除，
 * 同名 task_name 重 spawn 时覆盖登记。desktop 重启后内存清空 → state.md 同步 + 未登记兜底双保险。
 *
 * I/O 纪律：state.md 读取是 I/O——一律走 scheduleStateSync（fire-and-forget），
 * 由 fence.ts 在 SubagentStart 后的空闲窗口执行；判定路径（lookup）纯内存。
 * state 读取器经 bindStateReader 注入（插件环境 = ctx.fs；测试 = node:fs），本模块不 import node 内建。
 */

import {
	isProjectInternalGlob,
	parseScopeInput,
	roleFromTaskName,
	type FenceContract,
	type Role,
} from "./judge";

/** task_name 唯一性键（Map key）。 */
export type ContractKey = string;

interface PendingSpawn {
	/** PreToolUse(spawn_agent) 的 toolUseId——与 SubagentStart 关联的最可靠线索。 */
	toolUseId: string;
	/** spawn 输入解析出的契约（agentId 待回填）。 */
	contract: FenceContract;
	/** 入表时间戳（ms）——「最近一条 pending」回退匹配的排序依据。 */
	at: number;
}

/** state.md subStep 的 contract 字段落盘形态（§4.3）。 */
export interface StateContractRecord {
	taskName: string;
	scope: string[];
	agentType: string;
	role: Role;
	agentId?: string;
	/** git 写豁免（轻量 git 子代理契约落盘时携带，恢复时从严缺省 false）。 */
	gitWriteAllow?: boolean;
}

/** state.md 结构的最小可判子集（只取契约重建所需字段；完整规范见 ac-pipeline §3）。subSteps 递归展开。 */
export interface StateStepLike {
	agentRef?: string | null;
	subSteps?: StateStepLike[];
	contract?: StateContractRecord;
}

export interface StateFileLike {
	steps?: StateStepLike[];
}

/** 从 PreToolUse(spawn_agent) 的 toolInput 解析契约（§1.2 八要素映射的 scope 槽位）。 */
export function contractFromSpawnInput(input: unknown): FenceContract | null {
	if (typeof input !== "object" || input === null) return null;
	const record = input as Record<string, unknown>;
	const taskName = typeof record.task_name === "string" ? record.task_name.trim() : "";
	if (!taskName) return null;
	const task = (typeof record.task === "object" && record.task !== null ? record.task : {}) as Record<string, unknown>;
	const agentType = typeof record.agent_type === "string" ? record.agent_type : "general";
	const scope = parseScopeInput(task.scope).filter(isProjectInternalGlob);
	// git 写豁免（环节级存档通道）：仅轻量 git 子代理契约携带（judgeMainSpawn 已拦截偷带者）
	const gitWriteAllow = record.allow_git_write === true;
	return {
		role: roleFromTaskName(taskName),
		taskName,
		agentType,
		scope,
		gitWriteAllow,
		// agentId 待 SubagentStart 回填；toolUseId 由 PendingSpawn 承载，不进 FenceContract
		agentId: undefined,
	};
}

export class ContractStore {
	private readonly contracts = new Map<ContractKey, FenceContract>();
	/** PreToolUse 放行后、SubagentStart 回填前的 pending 队列（§4.1 来源 1→2 的桥）。 */
	private readonly pending: PendingSpawn[] = [];
	/** cwd → 是否已安排 state.md 兜底同步（去抖）。 */
	private readonly syncScheduled = new Set<string>();
	/**
	 * AC 治理会话标记（主控会话身份的插件侧事实源）。
	 *
	 * 宿主 PreToolUse 事件不填充 subagent 字段（内核 baseEvent 从不赋值），插件无法从事件体
	 * 区分主/子会话；但 SubagentStart 的 agentId 恒等于子会话 sessionId（runtime-subagents
	 * attachHandle：snapshot.id = handle.sessionId），因此「登记表按 sessionId 命中 = 子会话」。
	 * 主会话没有对等事件——本标记在 spawn_agent 通过 AC 契约校验时记录该 sessionId，
	 * 「命中标记 = AC 主控会话」；两者都不命中 = 与流水线无关的会话，围栏静默。
	 */
	private readonly governedSessions = new Set<string>();
	private stateReader: ((cwd: string) => Promise<StateFileLike | null>) | null = null;

	/** 注入 state.md 读取器（生产 = ctx.fs 装配；测试 = node:fs）。null/异常 = 静默跳过。 */
	public bindStateReader(reader: (cwd: string) => Promise<StateFileLike | null>): void {
		this.stateReader = reader;
	}

	/** 标记 AC 治理会话（spawn_agent 通过契约校验时调用；重复标记幂等）。 */
	public markGovernedSession(sessionId: string): void {
		this.governedSessions.add(sessionId);
	}

	/** 会话分类查询：命中登记表 = AC 子会话；命中标记 = AC 主控会话；否则为无关会话。 */
	public isGovernedSession(sessionId: string): boolean {
		return this.governedSessions.has(sessionId);
	}

	// ── 来源 1：PreToolUse(spawn_agent) ──

	/** spawn 放行后登记 pending 契约（若 spawn 被 block，fence.ts 不会调用本方法）。 */
	public registerSpawn(toolUseId: string, input: unknown): FenceContract | null {
		const contract = contractFromSpawnInput(input);
		if (contract === null) return null;
		// 同名 task_name 重 spawn：旧 pending 条目作废（其契约对象已被 Map 覆盖驱逐，
		// agentId 回填必须落在 Map 当前持有的对象上，否则 lookupByAgentId 永远落空）
		for (let i = this.pending.length - 1; i >= 0; i -= 1) {
			if (this.pending[i]?.contract.taskName === contract.taskName) this.pending.splice(i, 1);
		}
		this.pending.push({ toolUseId, contract, at: Date.now() });
		// 判定在 spawn 时即可用（§4.1）：立即以 taskName 入表，SubagentStart 只做 agentId 回填
		this.contracts.set(contract.taskName, contract);
		return contract;
	}

	// ── 来源 2：SubagentStart ──

	/**
	 * 回填 agentId：按「最近一条 pending」匹配（SubagentStart 事件体无 task_name——
	 * 事件体只有 agentId/agentType，pending 队列按时间序消费是最简单可靠者）。
	 */
	public bindAgentId(agentId: string, agentType: string): FenceContract | null {
		const index = this.pending.findIndex((p) => p.contract.agentType === agentType);
		const pendingSpawn = index >= 0 ? this.pending.splice(index, 1)[0] : this.pending.shift() ?? null;
		if (pendingSpawn === null) return null;
		pendingSpawn.contract.agentId = agentId;
		// agentId 写回契约对象（Map 里两键同引用：taskName 键在 registerSpawn 时已建）
		return pendingSpawn.contract;
	}

	// ── 查询（判定路径，纯内存） ──

	public lookupByAgentId(agentId: string): FenceContract | null {
		for (const contract of this.contracts.values()) {
			if (contract.agentId === agentId) return contract;
		}
		return null;
	}

	public lookupByTaskName(taskName: string): FenceContract | null {
		return this.contracts.get(taskName) ?? null;
	}

	public get size(): number {
		return this.contracts.size;
	}

	// ── 来源 3：state.md 兜底同步（恢复场景） ──

	/**
	 * 安排 fire-and-forget 的 state.md 同步（I/O 纪律：不在 handler 体内同步执行）。
	 * cwd 已安排过则跳过（去抖）；读取/parse 失败静默跳过（主控会重写 state.md）。
	 */
	public scheduleStateSync(cwd: string): void {
		if (this.syncScheduled.has(cwd)) return;
		this.syncScheduled.add(cwd);
		void (async () => {
			try {
				await this.applyStateSync(cwd);
			} finally {
				this.syncScheduled.delete(cwd);
			}
		})();
	}

	/** 读取 state.md 并把 contract 字段/agentRef 兜底重建进表（幂等：同名覆盖）。 */
	public async applyStateSync(cwd: string): Promise<void> {
		const reader = this.stateReader;
		if (reader === null) return;
		let state: StateFileLike | null = null;
		try {
			state = await reader(cwd);
		} catch {
			return; // 读取/parse 失败：静默跳过
		}
		if (state === null || typeof state !== "object") return;
		const walk = (steps: StateStepLike[] | undefined): void => {
			for (const step of steps ?? []) {
				const record = step.contract;
				if (record && typeof record.taskName === "string" && record.taskName) {
					const role: Role = record.role ?? roleFromTaskName(record.taskName);
					this.contracts.set(record.taskName, {
						role,
						taskName: record.taskName,
						agentId: typeof record.agentId === "string" ? record.agentId : undefined,
						agentType: typeof record.agentType === "string" ? record.agentType : "general",
						scope: Array.isArray(record.scope)
							? record.scope.filter((p): p is string => typeof p === "string")
							: [],
						// git 写豁免从落盘契约恢复（缺省 false——恢复路径从严）
						gitWriteAllow: record.gitWriteAllow === true,
					});
				}
				// agentRef 兜底：contract 字段缺失时至少按 task_name 建键（scope 空 → 判定按收紧走）
				else if (typeof step.agentRef === "string" && step.agentRef) {
					if (!this.contracts.has(step.agentRef)) {
						this.contracts.set(step.agentRef, {
							role: roleFromTaskName(step.agentRef),
							taskName: step.agentRef,
							agentType: "general",
							scope: [],
							// agentRef 兜底不授 git 写豁免（恢复路径从严——git 子代理契约应有完整 contract 字段）
							gitWriteAllow: false,
						});
					}
				}
				walk(step.subSteps);
			}
		};
		walk(state.steps);
	}
}
