// Modified by The Open Forge contributors.
import type { SubagentSchedulingEvent, SubagentSchedulingPhase, SubagentSchedulingReason } from "./contracts.js";
import type { SubagentRun } from "./subagent-run.js";

interface Admission {
	readonly id: string;
	readonly enqueuedAt: number;
	admittedAt?: number;
	childSessionId?: string;
}

interface SchedulingObservationOptions {
	readonly parentSessionId: string;
	readonly now: () => number;
	readonly counts: () => Pick<SubagentSchedulingEvent, "activeCount" | "queuedCount" | "maxConcurrent">;
	readonly onEvent?: (event: SubagentSchedulingEvent) => void | Promise<void>;
}

/** Tracks only live admission timing; never retains snapshots or caller-controlled task names. */
export class SubagentSchedulingObserver<TProfile> {
	private readonly admissions = new WeakMap<SubagentRun<TProfile>, Admission>();
	private sequence = 0;

	constructor(private readonly options: SchedulingObservationOptions) {}

	queued(run: SubagentRun<TProfile>): void {
		if (!this.options.onEvent) return;
		this.begin(run);
		this.emit("queued", run);
	}

	admitted(run: SubagentRun<TProfile>): void {
		if (!this.options.onEvent) return;
		const admission = this.admissions.get(run) ?? this.begin(run);
		admission.admittedAt = this.options.now();
		this.emit("admitted", run);
	}

	bound(run: SubagentRun<TProfile>, childSessionId: string): void {
		const admission = this.admissions.get(run);
		if (admission) admission.childSessionId = childSessionId;
	}

	rejected(): void {
		this.emit("rejected", undefined, "capacity");
	}

	settling(run: SubagentRun<TProfile>): void {
		this.emit("settling", run, "interrupted");
	}

	deadline(run: SubagentRun<TProfile>): void {
		this.emit("settle-deadline", run, "settle-deadline");
	}

	released(run: SubagentRun<TProfile>, reason?: "settle-deadline" | "parent-disposed"): void {
		const admission = this.admissions.get(run);
		if (!admission) return;
		const status = run.status;
		const terminalReason = status === "completed" || status === "failed" ? status : "interrupted";
		this.emit(
			"released",
			run,
			reason ?? (admission.admittedAt === undefined ? "cancelled-before-start" : terminalReason),
		);
		this.admissions.delete(run);
	}

	private begin(run: SubagentRun<TProfile>): Admission {
		const admission: Admission = {
			id: `subagent-admission-${++this.sequence}`,
			enqueuedAt: this.options.now(),
			childSessionId: run.childSessionId,
		};
		this.admissions.set(run, admission);
		return admission;
	}

	private emit(phase: SubagentSchedulingPhase, run?: SubagentRun<TProfile>, reason?: SubagentSchedulingReason): void {
		if (!this.options.onEvent) return;
		const admission = run ? this.admissions.get(run) : undefined;
		if (run && !admission) return;
		const timestamp = this.options.now();
		const event: SubagentSchedulingEvent = {
			phase,
			reason,
			timestamp,
			parentSessionId: this.options.parentSessionId,
			admissionId: admission?.id,
			childSessionId: admission?.childSessionId,
			generation: run?.readSnapshot().generation,
			...this.options.counts(),
			waitMs: admission ? Math.max(0, (admission.admittedAt ?? timestamp) - admission.enqueuedAt) : undefined,
			heldMs: admission?.admittedAt === undefined ? undefined : Math.max(0, timestamp - admission.admittedAt),
		};
		try {
			void Promise.resolve(this.options.onEvent(Object.freeze(event))).catch(() => undefined);
		} catch {
			// Observability must not acquire ownership of scheduling or delivery.
		}
	}
}
