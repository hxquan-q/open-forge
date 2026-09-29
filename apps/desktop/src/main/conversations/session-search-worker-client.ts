import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import type { DesktopSessionSearchEvent } from "../../shared/session-search.js";
import {
	mayRestartProcess,
	recordProcessCrash,
	recordProcessRestart,
	registerProcessRole,
} from "../app-monitor/process-health.js";
import type { SessionSearchWorkerRequest } from "./session-search-worker-protocol.js";

const HOST_DIR = dirname(fileURLToPath(import.meta.url));
const ROLE = "session-search";

/** One lazily-created worker; completed queries share a bounded index until the idle timeout. */
export class SessionSearchWorkerClient {
	private worker?: Worker;
	private idleTimer?: ReturnType<typeof setTimeout>;
	private crashed = false;
	private readonly listeners = new Map<string, (event: DesktopSessionSearchEvent) => void>();

	constructor(
		private readonly spawn = () =>
			new Worker(join(HOST_DIR, "session-search-worker.js"), { resourceLimits: { maxOldGenerationSizeMb: 512 } }),
	) {
		// worker_threads 与主进程同 pid，不做内存归因；崩溃→懒重生的窗口预算由记账簿裁决。
		registerProcessRole({ role: ROLE, kind: "worker", restartBudget: { maxRestarts: 3, windowMs: 300_000 } });
	}

	start(
		request: Extract<SessionSearchWorkerRequest, { type: "start" }>,
		onEvent: (event: DesktopSessionSearchEvent) => void,
	): () => void {
		clearTimeout(this.idleTimer);
		let worker: Worker;
		try {
			worker = this.getWorker();
		} catch {
			// 崩溃重生预算耗尽：以与 worker 崩溃相同的终态错误回报，不静默吞掉。
			onEvent({ requestId: request.requestId, done: true, error: "search-failed" });
			return () => {};
		}
		this.listeners.set(request.requestId, onEvent);
		try {
			worker.postMessage(request);
		} catch (error) {
			this.listeners.delete(request.requestId);
			this.scheduleIdleStop();
			throw error;
		}
		return () => {
			if (!this.listeners.delete(request.requestId)) return;
			if (this.worker === worker)
				worker.postMessage({ type: "cancel", requestId: request.requestId } satisfies SessionSearchWorkerRequest);
			this.scheduleIdleStop();
		};
	}

	invalidate(): void {
		this.worker?.postMessage({ type: "invalidate" } satisfies SessionSearchWorkerRequest);
	}

	private getWorker(): Worker {
		if (this.worker) return this.worker;
		if (this.crashed) {
			if (!mayRestartProcess(ROLE)) {
				throw new Error("session-search worker restart budget exhausted");
			}
			recordProcessRestart(ROLE);
			this.crashed = false;
		}
		const worker = this.spawn();
		this.worker = worker;
		worker.on("message", (event: DesktopSessionSearchEvent) => {
			if (this.worker !== worker) return;
			const listener = this.listeners.get(event.requestId);
			if (event.done) this.listeners.delete(event.requestId);
			listener?.(event);
			this.scheduleIdleStop();
		});
		const failed = () => {
			if (this.worker !== worker) return;
			this.worker = undefined;
			this.crashed = true;
			recordProcessCrash(ROLE);
			const pending = [...this.listeners];
			this.listeners.clear();
			for (const [requestId, listener] of pending) listener({ requestId, done: true, error: "search-failed" });
		};
		worker.on("error", failed);
		worker.on("exit", failed);
		worker.unref();
		return worker;
	}

	private scheduleIdleStop(): void {
		if (this.listeners.size > 0) return;
		clearTimeout(this.idleTimer);
		this.idleTimer = setTimeout(() => {
			const worker = this.worker;
			this.worker = undefined;
			void worker?.terminate();
		}, 60_000);
		this.idleTimer.unref();
	}
}
