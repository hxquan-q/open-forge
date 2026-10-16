// Copyright The Open Forge contributors.
import {
	classifySessionInterruptHealth,
	type SessionInterruptClassification,
	type SessionInterruptTrigger,
} from "@vetta/coding-agent/runtime";
import type { RuntimeHost } from "@vetta/runtime-core";
import { describeError } from "../logger/describe-error.js";
import { getAppLogger } from "../logger.js";
import { isSessionInterruptDraftNonEmpty } from "./session-interrupt-draft-registry.js";
import { buildSessionInterruptEvidence } from "./session-interrupt-evidence.js";

const log = getAppLogger("session-interrupt");

export const SESSION_INTERRUPT_SCAN_INTERVAL_MS = 15_000;

export type SessionInterruptContinueMode = "off" | "notify" | "auto";

export interface SessionInterruptNotifyPayload {
	readonly sessionId: string;
	readonly sessionPath: string | undefined;
	readonly classification: SessionInterruptClassification;
	readonly action: "notify" | "auto-retried";
}

export interface SessionInterruptMonitorPorts {
	readonly getRuntime: () => RuntimeHost;
	readonly listCandidateSessionIds: () => readonly string[];
	readonly hasPendingAction: (sessionId: string) => boolean;
	/** 该会话所属团队是否仍有在途工作（等成员返回的安静不判 suspected，BUG-0126）。 */
	readonly hasPendingSubagentWork: (sessionId: string) => boolean;
	readonly wasManualStopped: (sessionId: string) => boolean;
	readonly readMode: () => SessionInterruptContinueMode;
	readonly readMaxAttempts: () => number;
	readonly onDecision: (payload: SessionInterruptNotifyPayload) => void;
	readonly nowMs?: () => number;
}

/**
 * 跨会话低频巡检：装配证据 → 共用 classify → notify/auto 两档。
 * 形状对齐 TeamRecoveryMonitor（generation + unref timer）。
 */
export class SessionInterruptMonitor {
	private timer: ReturnType<typeof setTimeout> | undefined;
	private running = false;
	private active = false;
	private generation = 0;
	private readonly attemptCounts = new Map<string, number>();
	/**
	 * 每个会话最近一次已提示的判定 key（`state:trigger`）。悬挂判定会持续命中
	 * （每 15s 扫描一次），不去重则同一条未解决提示会反复发系统通知与 toast；
	 * 判定化解（回到 running/completed 等不再可绑定状态）后清除，允许再发生。
	 */
	private readonly lastNotifiedDecision = new Map<string, string>();

	constructor(private readonly ports: SessionInterruptMonitorPorts) {}

	start(): void {
		this.generation += 1;
		this.active = true;
		if (!this.timer && !this.running) this.schedule();
	}

	stop(): void {
		this.generation += 1;
		this.active = false;
		if (this.timer) clearTimeout(this.timer);
		this.timer = undefined;
	}

	forgetSession(sessionId: string): void {
		this.attemptCounts.delete(sessionId);
		this.lastNotifiedDecision.delete(sessionId);
	}

	/** 立即巡检一轮（测试与手动触发）；正常路径走定时 schedule。 */
	async reconcileNow(): Promise<void> {
		await this.scan();
	}

	private schedule(): void {
		this.timer = setTimeout(() => {
			void this.scan();
		}, SESSION_INTERRUPT_SCAN_INTERVAL_MS);
		this.timer.unref?.();
	}

	private async scan(): Promise<void> {
		this.timer = undefined;
		this.running = true;
		const generation = this.generation;
		try {
			const mode = this.ports.readMode();
			if (mode === "off") return;
			const ids = this.ports.listCandidateSessionIds();
			for (const sessionId of ids) {
				await this.reconcileSession(sessionId, mode);
			}
		} catch (error) {
			log.warn("Session interrupt scan failed", {
				errorName: describeError(error),
			});
		} finally {
			this.running = false;
			if (this.active && generation === this.generation) this.schedule();
		}
	}

	private async reconcileSession(sessionId: string, mode: SessionInterruptContinueMode): Promise<void> {
		const runtime = this.ports.getRuntime();
		let state: ReturnType<RuntimeHost["getState"]>;
		try {
			state = runtime.getState(sessionId);
		} catch {
			return;
		}
		let activityAtMs: number | undefined;
		if (state.isStreaming) {
			// streaming 不再直接跳过：零事件悬挂（turn 永不结算）的会话同样可能
			// 异常中断。但判定必须基于逐事件活动证据；宿主尚未观察到任何事件时
			// 无法区分健康长回合与悬挂，宁沉默不误报。
			if (state.lastEventAt === undefined) return;
			activityAtMs = state.lastEventAt;
		}

		const maxAttempts = Math.max(1, this.ports.readMaxAttempts());
		const continueAttemptCount = this.attemptCounts.get(sessionId) ?? 0;
		const evidence = buildSessionInterruptEvidence({
			isStreaming: state.isStreaming,
			messages: runtime.getMessages(sessionId),
			nowMs: this.ports.nowMs?.() ?? Date.now(),
			manualStop: this.ports.wasManualStopped(sessionId),
			draftNonEmpty:
				isSessionInterruptDraftNonEmpty(sessionId) ||
				isSessionInterruptDraftNonEmpty(runtime.getSessionPath(sessionId) ?? ""),
			hasPendingAction: this.ports.hasPendingAction(sessionId),
			waitingOnSubagent: this.ports.hasPendingSubagentWork(sessionId),
			continueAttemptCount,
			maxContinueAttempts: maxAttempts,
			...(activityAtMs !== undefined ? { activityAtMs } : {}),
		});
		const classification = classifySessionInterruptHealth(evidence);
		if (!classification.eligibleForBinding) {
			// 判定已化解（回到 running/completed/stopped 等）：允许下一次中断再次提示。
			this.lastNotifiedDecision.delete(sessionId);
			return;
		}

		if (mode === "auto" && classification.shouldAutoContinue) {
			this.attemptCounts.set(sessionId, continueAttemptCount + 1);
			try {
				await runtime.retry(sessionId);
				this.ports.onDecision({
					sessionId,
					sessionPath: runtime.getSessionPath(sessionId),
					classification,
					action: "auto-retried",
				});
				log.info("Session interrupt auto-continued", {
					sessionId,
					trigger: classification.trigger as SessionInterruptTrigger,
				});
			} catch (error) {
				log.warn("Session interrupt auto-continue failed", {
					sessionId,
					errorName: describeError(error),
				});
			}
			return;
		}

		if (classification.shouldNotify || classification.shouldAutoContinue) {
			const decisionKey = `${classification.state}:${classification.trigger ?? "none"}`;
			if (this.lastNotifiedDecision.get(sessionId) === decisionKey) return;
			this.lastNotifiedDecision.set(sessionId, decisionKey);
			this.ports.onDecision({
				sessionId,
				sessionPath: runtime.getSessionPath(sessionId),
				classification,
				action: "notify",
			});
		}
	}
}
