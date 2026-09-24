// Copyright The Open Forge contributors.
import {
	classifySessionInterruptHealth,
	type SessionInterruptClassification,
	type SessionInterruptTrigger,
} from "@vetta/coding-agent/runtime";
import type { RuntimeHost } from "@vetta/runtime-core";
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
				errorName: error instanceof Error ? error.name : "UnknownError",
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
		if (state.isStreaming) return;

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
			continueAttemptCount,
			maxContinueAttempts: maxAttempts,
		});
		const classification = classifySessionInterruptHealth(evidence);
		if (!classification.eligibleForBinding) return;

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
					errorName: error instanceof Error ? error.name : "UnknownError",
				});
			}
			return;
		}

		if (classification.shouldNotify || classification.shouldAutoContinue) {
			this.ports.onDecision({
				sessionId,
				sessionPath: runtime.getSessionPath(sessionId),
				classification,
				action: "notify",
			});
		}
	}
}
