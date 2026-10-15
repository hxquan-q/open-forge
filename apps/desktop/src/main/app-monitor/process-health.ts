// Copyright The Open Forge contributors.
import { getAppLogger } from "../logger.js";

export type BackgroundProcessKind = "utility-process" | "worker" | "child-process" | "sidecar";

export interface ProcessRestartBudget {
	/** 窗口内允许的最大自动重启次数。 */
	readonly maxRestarts: number;
	readonly windowMs: number;
}

export interface ProcessRoleContract {
	/** 稳定 role 名，进入性能快照与诊断包（如 "session-search"）。 */
	readonly role: string;
	readonly kind: BackgroundProcessKind;
	/**
	 * 交由记账簿裁决的窗口化重启预算。缺省表示该 supervisor 自带重启决策，
	 * 记账簿只负责计数与内存归因，`mayRestart` 对无预算 role 返回 true。
	 */
	readonly restartBudget?: ProcessRestartBudget;
}

export interface ProcessRoleHealth {
	readonly role: string;
	readonly kind: BackgroundProcessKind;
	readonly crashes: number;
	readonly restarts: number;
	readonly lastCrashAt?: number;
	readonly lastRestartAt?: number;
	readonly pid?: number;
	readonly restartBudgetExhausted: boolean;
}

interface RoleState {
	readonly contract: ProcessRoleContract;
	crashes: number;
	restarts: number;
	lastCrashAt?: number;
	lastRestartAt?: number;
	pid?: number;
	readonly restartAt: number[];
}

const log = getAppLogger("process-health");

/**
 * 后台进程统一健康记账：按 role 记崩溃/重启计数、窗口化重启预算裁决与
 * pid→role 内存归因。旁路性质与 app-monitor 一致：注册失败、重复注册都只
 * 降级为 warn，不向业务路径抛出。
 */
export class ProcessHealthBook {
	private readonly roles = new Map<string, RoleState>();
	private readonly pidToRole = new Map<number, string>();

	constructor(private readonly now: () => number = Date.now) {}

	register(contract: ProcessRoleContract): void {
		const existing = this.roles.get(contract.role);
		if (existing) {
			if (existing.contract.kind !== contract.kind) {
				log.warn("process role re-registered with a different kind", {
					role: contract.role,
					was: existing.contract.kind,
					now: contract.kind,
				});
			}
			return;
		}
		this.roles.set(contract.role, { contract, crashes: 0, restarts: 0, restartAt: [] });
	}

	/** 关联当前活跃 pid 供内存归因；pid 变化时更新，传 undefined 清除。 */
	attributePid(role: string, pid: number | undefined): void {
		const state = this.stateOf(role);
		if (!state) return;
		if (state.pid !== undefined && state.pid !== pid) this.pidToRole.delete(state.pid);
		state.pid = pid;
		if (pid !== undefined) this.pidToRole.set(pid, role);
	}

	roleForPid(pid: number): string | undefined {
		return this.pidToRole.get(pid);
	}

	recordCrash(role: string): void {
		const state = this.stateOf(role);
		if (!state) return;
		state.crashes += 1;
		state.lastCrashAt = this.now();
		if (state.pid !== undefined) {
			this.pidToRole.delete(state.pid);
			state.pid = undefined;
		}
	}

	/** 监督器真正发起一次重启时调用；计数进预算窗口。 */
	recordRestart(role: string): void {
		const state = this.stateOf(role);
		if (!state) return;
		const at = this.now();
		state.restarts += 1;
		state.lastRestartAt = at;
		state.restartAt.push(at);
	}

	/** 有窗口预算的 role：窗口内重启次数未用尽才允许再重启。无预算时恒 true（只记账）。 */
	mayRestart(role: string): boolean {
		const state = this.stateOf(role);
		if (!state) return true;
		const budget = state.contract.restartBudget;
		if (!budget) return true;
		return this.restartsInWindow(state, this.now()) < budget.maxRestarts;
	}

	snapshot(): readonly ProcessRoleHealth[] {
		const at = this.now();
		return [...this.roles.values()].map((state) => ({
			role: state.contract.role,
			kind: state.contract.kind,
			crashes: state.crashes,
			restarts: state.restarts,
			...(state.lastCrashAt !== undefined ? { lastCrashAt: state.lastCrashAt } : {}),
			...(state.lastRestartAt !== undefined ? { lastRestartAt: state.lastRestartAt } : {}),
			...(state.pid !== undefined ? { pid: state.pid } : {}),
			restartBudgetExhausted:
				state.contract.restartBudget !== undefined &&
				this.restartsInWindow(state, at) >= state.contract.restartBudget.maxRestarts,
		}));
	}

	private restartsInWindow(state: RoleState, at: number): number {
		const budget = state.contract.restartBudget;
		if (!budget) return state.restarts;
		while (state.restartAt.length > 0 && state.restartAt[0] <= at - budget.windowMs) state.restartAt.shift();
		return state.restartAt.length;
	}

	private stateOf(role: string): RoleState | undefined {
		const state = this.roles.get(role);
		if (!state) log.warn("process health event for unregistered role", { role });
		return state;
	}
}

let healthBook = new ProcessHealthBook();

/** 测试用：替换全局记账簿（含时钟注入）。生产代码不调用。 */
export function setProcessHealthBookForTest(book: ProcessHealthBook): void {
	healthBook = book;
}

export function getProcessHealthBook(): ProcessHealthBook {
	return healthBook;
}

export function registerProcessRole(contract: ProcessRoleContract): void {
	try {
		healthBook.register(contract);
	} catch (error) {
		log.warn("process role registration failed", { role: contract.role }, error);
	}
}

export function attributeProcessPid(role: string, pid: number | undefined): void {
	try {
		healthBook.attributePid(role, pid);
	} catch (error) {
		log.warn("process pid attribution failed", { role, pid }, error);
	}
}

export function recordProcessCrash(role: string): void {
	try {
		healthBook.recordCrash(role);
	} catch (error) {
		log.warn("process crash accounting failed", { role }, error);
	}
}

export function recordProcessRestart(role: string): void {
	try {
		healthBook.recordRestart(role);
	} catch (error) {
		log.warn("process restart accounting failed", { role }, error);
	}
}

export function mayRestartProcess(role: string): boolean {
	try {
		return healthBook.mayRestart(role);
	} catch (error) {
		log.warn("process restart budget check failed", { role }, error);
		return true;
	}
}
