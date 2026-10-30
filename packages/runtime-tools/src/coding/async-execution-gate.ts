// Modified by The Open Forge contributors.
import {
	type AsyncExecutionGate,
	AsyncExecutionGateError,
	type AsyncExecutionGateOptions,
	type AsyncExecutionGatePhase,
	type AsyncExecutionGateRunOptions,
} from "./async-execution-gate-contracts.js";

type Owner = string | undefined;
interface Entry {
	readonly owner: Owner;
	start(): void;
}

/** Keeps capacity until the original operation settles, even after caller cancellation. */
export function createAsyncExecutionGate(
	maxConcurrent: number,
	options: AsyncExecutionGateOptions = {},
): AsyncExecutionGate {
	const limit = Number.isFinite(maxConcurrent) ? Math.max(1, Math.floor(maxConcurrent)) : 1;
	if (options.maxQueued !== undefined && (!Number.isSafeInteger(options.maxQueued) || options.maxQueued < 0)) {
		throw new RangeError("maxQueued must be a non-negative safe integer");
	}
	const now = options.now ?? Date.now;
	const queue: Entry[] = [];
	const owners: Owner[] = [];
	const ownerActive = new Map<Owner, number>();
	let cursor = 0;
	let active = 0;
	let draining = 0;
	let pumping = false;

	const retireOwner = (owner: Owner): void => {
		if ((ownerActive.get(owner) ?? 0) > 0 || queue.some((entry) => entry.owner === owner)) return;
		ownerActive.delete(owner);
		const index = owners.indexOf(owner);
		if (index < 0) return;
		owners.splice(index, 1);
		if (index < cursor) cursor -= 1;
	};
	const takeNext = (): Entry | undefined => {
		if (options.scheduling !== "round-robin") return queue.shift();
		for (let offset = 0; offset < owners.length; offset += 1) {
			const ownerIndex = (cursor + offset) % owners.length;
			const index = queue.findIndex((entry) => entry.owner === owners[ownerIndex]);
			if (index < 0) continue;
			cursor = ownerIndex + 1;
			return queue.splice(index, 1)[0];
		}
		return undefined;
	};
	const pump = (): void => {
		if (pumping) return;
		pumping = true;
		try {
			while (active < limit) {
				const entry = takeNext();
				if (!entry) return;
				entry.start();
			}
		} finally {
			pumping = false;
		}
	};

	return {
		run<T>(operation: () => Promise<T>, runOptions: AsyncExecutionGateRunOptions = {}): Promise<T> {
			const waitTimeout = runOptions.waitTimeoutMs;
			if (waitTimeout !== undefined && (!Number.isFinite(waitTimeout) || waitTimeout < 0)) {
				return Promise.reject(new RangeError("waitTimeoutMs must be a finite non-negative number"));
			}
			return new Promise<T>((resolve, reject) => {
				const enqueuedAt = now();
				let startedAt: number | undefined;
				let state: "queued" | "running" | "draining" | "released" = "queued";
				let callerSettled = false;
				let waited = false;
				let timer: ReturnType<typeof setTimeout> | undefined;
				const clearWaitingTimer = (): void => {
					if (timer !== undefined) clearTimeout(timer);
					timer = undefined;
				};
				const emit = (phase: AsyncExecutionGatePhase): void => {
					if (!runOptions.onEvent) return;
					const timestamp = now();
					try {
						const observed = runOptions.onEvent(
							Object.freeze({
								phase,
								timestamp,
								...(runOptions.ownerId !== undefined ? { ownerId: runOptions.ownerId } : {}),
								...(runOptions.requestId !== undefined ? { requestId: runOptions.requestId } : {}),
								activeCount: active,
								queuedCount: queue.length,
								drainingCount: draining,
								waitMs: Math.max(0, (startedAt ?? timestamp) - enqueuedAt),
								...(startedAt !== undefined ? { heldMs: Math.max(0, timestamp - startedAt) } : {}),
							}),
						);
						void Promise.resolve(observed).catch(() => undefined);
					} catch {
						// Diagnostics cannot change admission, resource ownership, or the operation result.
					}
				};
				const failWaiting = (
					phase: "cancelled" | "timed-out" | "rejected",
					error: AsyncExecutionGateError,
				): void => {
					if (state !== "queued") return;
					state = "released";
					const index = queue.indexOf(entry);
					if (index >= 0) queue.splice(index, 1);
					clearWaitingTimer();
					runOptions.signal?.removeEventListener("abort", onAbort);
					retireOwner(entry.owner);
					emit(phase);
					callerSettled = true;
					reject(error);
				};
				const onAbort = (): void => {
					const error = new AsyncExecutionGateError("ASYNC_EXECUTION_ABORTED", "Operation aborted");
					if (state === "queued") failWaiting("cancelled", error);
					else if (state === "running") {
						state = "draining";
						draining += 1;
						runOptions.signal?.removeEventListener("abort", onAbort);
						callerSettled = true;
						emit("cancelled");
						reject(error);
					}
				};
				const finish = (outcome: { ok: true; value: T } | { ok: false; error: unknown }): void => {
					if (state === "draining") draining -= 1;
					state = "released";
					active -= 1;
					ownerActive.set(entry.owner, (ownerActive.get(entry.owner) ?? 1) - 1);
					runOptions.signal?.removeEventListener("abort", onAbort);
					retireOwner(entry.owner);
					emit("released");
					pump();
					if (callerSettled) return;
					callerSettled = true;
					if (outcome.ok) resolve(outcome.value);
					else reject(outcome.error);
				};
				const expire = (): void =>
					failWaiting(
						"timed-out",
						new AsyncExecutionGateError(
							"ASYNC_EXECUTION_WAIT_TIMEOUT",
							`Resource admission timed out after ${waitTimeout}ms; the operation did not start.`,
						),
					);
				const entry: Entry = {
					owner: runOptions.ownerId,
					start() {
						if (state !== "queued") return;
						if (waited && waitTimeout !== undefined && now() - enqueuedAt >= waitTimeout) {
							expire();
							return;
						}
						clearWaitingTimer();
						state = "running";
						startedAt = now();
						active += 1;
						ownerActive.set(entry.owner, (ownerActive.get(entry.owner) ?? 0) + 1);
						emit("started");
						if (callerSettled) {
							finish({ ok: false, error: undefined });
							return;
						}
						try {
							void operation().then(
								(value) => finish({ ok: true, value }),
								(error: unknown) => finish({ ok: false, error }),
							);
						} catch (error) {
							finish({ ok: false, error });
						}
					},
				};
				if (runOptions.signal?.aborted) {
					onAbort();
					return;
				}
				const immediate = active < limit && queue.length === 0;
				if (!immediate && options.maxQueued !== undefined && queue.length >= options.maxQueued) {
					failWaiting(
						"rejected",
						new AsyncExecutionGateError(
							"ASYNC_EXECUTION_QUEUE_FULL",
							"Resource admission queue is full; the operation did not start.",
						),
					);
					return;
				}
				if (!owners.includes(entry.owner)) owners.push(entry.owner);
				queue.push(entry);
				runOptions.signal?.addEventListener("abort", onAbort, { once: true });
				pump();
				if (state === "queued") {
					waited = true;
					emit("queued");
					if (state === "queued" && waitTimeout !== undefined) {
						const remaining = waitTimeout - (now() - enqueuedAt);
						if (remaining <= 0) expire();
						else timer = setTimeout(expire, remaining);
					}
				}
			});
		},
	};
}
