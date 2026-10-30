// Modified by The Open Forge contributors.
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AsyncExecutionGateEvent, createAsyncExecutionGate } from "../../src/coding/index.js";

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("createAsyncExecutionGate", () => {
	it("cancels a waiting request without starting its operation and admits later work", async () => {
		const gate = createAsyncExecutionGate(1);
		const release = deferred<void>();
		const active = gate.run(() => release.promise);
		const controller = new AbortController();
		let cancelledOutcome: unknown;
		let cancelledStarted = false;
		const cancelled = gate
			.run(
				async () => {
					cancelledStarted = true;
				},
				{ signal: controller.signal },
			)
			.catch((error: unknown) => {
				cancelledOutcome = error;
			});
		controller.abort();
		await Promise.resolve();
		try {
			expect(cancelledOutcome).toMatchObject({ code: "ASYNC_EXECUTION_ABORTED" });
			expect(cancelledStarted).toBe(false);
		} finally {
			release.resolve();
			await Promise.all([active, cancelled]);
		}
		expect(await gate.run(async () => "next")).toBe("next");
		expect(cancelledStarted).toBe(false);
	});

	it("returns cancellation promptly while retaining capacity until the original operation settles", async () => {
		const gate = createAsyncExecutionGate(1);
		const release = deferred<void>();
		const controller = new AbortController();
		let outcome: unknown;
		const active = gate
			.run(() => release.promise, { signal: controller.signal })
			.catch((error: unknown) => {
				outcome = error;
			});
		let nextStarted = false;
		const next = gate.run(async () => {
			nextStarted = true;
		});
		controller.abort();
		await Promise.resolve();
		try {
			expect(outcome).toMatchObject({ code: "ASYNC_EXECUTION_ABORTED" });
			expect(nextStarted).toBe(false);
		} finally {
			release.resolve();
			await Promise.all([active, next]);
		}
		expect(nextStarted).toBe(true);
	});

	it("limits concurrency and starts queued operations in FIFO order", async () => {
		const gate = createAsyncExecutionGate(2);
		const first = deferred<void>();
		const second = deferred<void>();
		const third = deferred<void>();
		const started: number[] = [];
		let active = 0;
		let maxActive = 0;
		const run = (id: number, release: Promise<void>) =>
			gate.run(async () => {
				started.push(id);
				active += 1;
				maxActive = Math.max(maxActive, active);
				await release;
				active -= 1;
				return id;
			});

		const firstRun = run(1, first.promise);
		const secondRun = run(2, second.promise);
		const thirdRun = run(3, third.promise);
		expect(started).toEqual([1, 2]);

		second.resolve();
		await secondRun;
		await Promise.resolve();
		expect(started).toEqual([1, 2, 3]);
		first.resolve();
		third.resolve();
		expect(await Promise.all([firstRun, thirdRun])).toEqual([1, 3]);
		expect(maxActive).toBe(2);
	});

	it("releases capacity after rejection and clamps invalid limits to one", async () => {
		const gate = createAsyncExecutionGate(0);
		const release = deferred<void>();
		const started: string[] = [];
		const failed = gate.run(async () => {
			started.push("failed");
			await release.promise;
			throw new Error("failed operation");
		});
		const next = gate.run(async () => {
			started.push("next");
			return "done";
		});
		expect(started).toEqual(["failed"]);

		release.resolve();
		await expect(failed).rejects.toThrow("failed operation");
		expect(await next).toBe("done");
		expect(started).toEqual(["failed", "next"]);
	});

	it("bounds the waiting queue, expires only waiting work, and clears its timer", async () => {
		vi.useFakeTimers();
		const gate = createAsyncExecutionGate(1, { maxQueued: 1 });
		const release = deferred<void>();
		const active = gate.run(() => release.promise, { waitTimeoutMs: 1 });
		const expiredOperation = vi.fn(async () => "expired");
		const expired = gate.run(expiredOperation, { waitTimeoutMs: 50 }).catch((error: unknown) => error);
		await expect(gate.run(async () => "overflow")).rejects.toMatchObject({ code: "ASYNC_EXECUTION_QUEUE_FULL" });
		await vi.advanceTimersByTimeAsync(50);
		expect(await expired).toMatchObject({ code: "ASYNC_EXECUTION_WAIT_TIMEOUT" });
		expect(expiredOperation).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
		const next = gate.run(async () => "next", { waitTimeoutMs: 50 });
		release.resolve();
		await active;
		expect(await next).toBe("next");
		expect(vi.getTimerCount()).toBe(0);
	});

	it("allows immediate work with no queue budget and rejects an already aborted request", async () => {
		const gate = createAsyncExecutionGate(1, { maxQueued: 0 });
		const release = deferred<void>();
		const active = gate.run(() => release.promise);
		await expect(gate.run(async () => "overflow")).rejects.toMatchObject({ code: "ASYNC_EXECUTION_QUEUE_FULL" });
		const controller = new AbortController();
		controller.abort("private cancellation content");
		const never = vi.fn(async () => "never");
		await expect(gate.run(never, { signal: controller.signal })).rejects.toMatchObject({
			code: "ASYNC_EXECUTION_ABORTED",
		});
		expect(never).not.toHaveBeenCalled();
		release.resolve();
		await active;
		expect(await gate.run(async () => "next", { waitTimeoutMs: 0 })).toBe("next");
	});

	it("rotates owners while preserving each owner's arrival order", async () => {
		const gate = createAsyncExecutionGate(1, { scheduling: "round-robin" });
		const started: string[] = [];
		const held = new Map<string, Deferred<void>>();
		const run = (ownerId: string, id: string) => {
			const release = deferred<void>();
			held.set(id, release);
			return gate.run(
				async () => {
					started.push(id);
					await release.promise;
				},
				{ ownerId },
			);
		};
		const first = run("A", "A0");
		const remaining = [run("A", "A1"), run("A", "A2"), run("B", "B1"), run("C", "C1"), run("B", "B2")];
		try {
			held.get("A0")?.resolve();
			await first;
			expect(started).toEqual(["A0", "B1"]);
			held.get("B1")?.resolve();
			await Promise.resolve();
			await Promise.resolve();
			expect(started).toEqual(["A0", "B1", "C1"]);
		} finally {
			for (const release of held.values()) release.resolve();
			await Promise.all(remaining);
		}
		expect(started).toEqual(["A0", "B1", "C1", "A1", "B2", "A2"]);
	});

	it("observes draining and final resource release without exposing results or abort reasons", async () => {
		const events: AsyncExecutionGateEvent[] = [];
		let time = 100;
		const gate = createAsyncExecutionGate(1, { now: () => time });
		const release = deferred<void>();
		const controller = new AbortController();
		const active = gate
			.run(
				async () => {
					await release.promise;
					return "private result";
				},
				{
					signal: controller.signal,
					ownerId: "session-1",
					requestId: "call-1",
					onEvent: (event) => {
						events.push(event);
					},
				},
			)
			.catch((error: unknown) => error);
		time = 150;
		controller.abort("private abort reason");
		expect(await active).toMatchObject({ code: "ASYNC_EXECUTION_ABORTED" });
		expect(events.at(-1)).toMatchObject({ phase: "cancelled", activeCount: 1, drainingCount: 1, heldMs: 50 });
		time = 200;
		release.resolve();
		await Promise.resolve();
		await Promise.resolve();
		expect(events.at(-1)).toMatchObject({ phase: "released", activeCount: 0, drainingCount: 0, heldMs: 100 });
		expect(JSON.stringify(events)).not.toContain("private");
	});

	it("isolates throwing observers and recovers from a synchronous operation failure", async () => {
		const gate = createAsyncExecutionGate(1);
		const failure = new Error("operation failure");
		await expect(
			gate.run(
				() => {
					throw failure;
				},
				{
					onEvent: () => {
						throw new Error("observer failure");
					},
				},
			),
		).rejects.toBe(failure);
		expect(await gate.run(async () => "still available")).toBe("still available");
	});

	it("validates bounded options and does not let invalid concurrency permanently block work", async () => {
		expect(() => createAsyncExecutionGate(1, { maxQueued: -1 })).toThrow(RangeError);
		await expect(createAsyncExecutionGate(1).run(async () => 1, { waitTimeoutMs: Number.NaN })).rejects.toThrow(
			RangeError,
		);
		expect(await createAsyncExecutionGate(Number.NaN).run(async () => 1)).toBe(1);
	});

	it.each(["queued", "started"] as const)(
		"isolates synchronous abort and reentry from a %s observer",
		async (phase) => {
			const gate = createAsyncExecutionGate(1);
			const release = deferred<void>();
			const holder = gate.run(() => release.promise);
			const controller = new AbortController();
			const started: string[] = [];
			const events: AsyncExecutionGateEvent[] = [];
			let reentered: Promise<void> | undefined;
			let doomedStarted = false;
			const first =
				phase === "queued"
					? gate.run(async () => {
							started.push("existing");
						})
					: undefined;
			const doomed = gate
				.run(
					async () => {
						doomedStarted = true;
					},
					{
						signal: controller.signal,
						onEvent(event) {
							events.push(event);
							if (event.phase !== phase) return;
							controller.abort();
							reentered = gate.run(
								async () => {
									started.push("reentered");
								},
								{
									onEvent: (nested) => {
										events.push(nested);
									},
								},
							);
						},
					},
				)
				.catch((error: unknown) => error);
			const existing =
				first ??
				gate.run(async () => {
					started.push("existing");
				});
			release.resolve();
			await holder;
			expect(await doomed).toMatchObject({ code: "ASYNC_EXECUTION_ABORTED" });
			await Promise.all([existing, reentered]);
			expect(started).toEqual(["existing", "reentered"]);
			expect(doomedStarted).toBe(false);
			expect(events.every((event) => event.activeCount <= 1 && event.drainingCount <= event.activeCount)).toBe(true);
			expect(await gate.run(async () => "available")).toBe("available");
		},
	);

	it("preserves an existing queue when a released observer cancels a waiter and reenters", async () => {
		const gate = createAsyncExecutionGate(1);
		const release = deferred<void>();
		const controller = new AbortController();
		const started: string[] = [];
		let reentered: Promise<void> | undefined;
		const holder = gate.run(() => release.promise, {
			onEvent(event) {
				if (event.phase !== "released") return;
				controller.abort();
				reentered = gate.run(async () => {
					started.push("reentered");
				});
			},
		});
		const cancelled = gate
			.run(
				async () => {
					started.push("cancelled");
				},
				{ signal: controller.signal },
			)
			.catch((error: unknown) => error);
		const existing = gate.run(async () => {
			started.push("existing");
		});
		release.resolve();
		await holder;
		expect(await cancelled).toMatchObject({ code: "ASYNC_EXECUTION_ABORTED" });
		await Promise.all([existing, reentered]);
		expect(started).toEqual(["existing", "reentered"]);
	});

	it.each(["complete", "cancel", "timeout"] as const)(
		"removes a waiting request's signal listener after %s",
		async (outcome) => {
			vi.useFakeTimers();
			const gate = createAsyncExecutionGate(1);
			const release = deferred<void>();
			const holder = gate.run(() => release.promise);
			const controller = new AbortController();
			const added = vi.spyOn(controller.signal, "addEventListener");
			const removed = vi.spyOn(controller.signal, "removeEventListener");
			const operation = vi.fn(async () => "completed");
			const request = gate
				.run(operation, { signal: controller.signal, waitTimeoutMs: 50 })
				.catch((error: unknown) => error);
			const abortListeners = added.mock.calls.filter(([type]) => type === "abort");
			expect(abortListeners).toHaveLength(1);
			if (outcome === "cancel") controller.abort();
			if (outcome === "timeout") await vi.advanceTimersByTimeAsync(50);
			if (outcome === "complete") release.resolve();
			try {
				const result = await request;
				if (outcome === "complete") expect(result).toBe("completed");
				else {
					expect(result).toMatchObject({
						code: outcome === "cancel" ? "ASYNC_EXECUTION_ABORTED" : "ASYNC_EXECUTION_WAIT_TIMEOUT",
					});
					expect(operation).not.toHaveBeenCalled();
				}
				expect(
					removed.mock.calls.some(([type, listener]) => type === "abort" && listener === abortListeners[0]?.[1]),
				).toBe(true);
				expect(vi.getTimerCount()).toBe(0);
			} finally {
				release.resolve();
				await holder;
			}
		},
	);

	it("handles a late operation rejection after cancellation, clears its listener, and returns capacity", async () => {
		const gate = createAsyncExecutionGate(1);
		const original = deferred<void>();
		const controller = new AbortController();
		const added = vi.spyOn(controller.signal, "addEventListener");
		const removed = vi.spyOn(controller.signal, "removeEventListener");
		const cancelled = gate
			.run(() => original.promise, { signal: controller.signal })
			.catch((error: unknown) => error);
		const nextOperation = vi.fn(async () => "next");
		const next = gate.run(nextOperation);
		try {
			controller.abort();
			expect(await cancelled).toMatchObject({ code: "ASYNC_EXECUTION_ABORTED" });
			const abortListener = added.mock.calls.find(([type]) => type === "abort")?.[1];
			expect(abortListener).toEqual(expect.any(Function));
			expect(removed.mock.calls.some(([type, listener]) => type === "abort" && listener === abortListener)).toBe(
				true,
			);
			expect(nextOperation).not.toHaveBeenCalled();
			original.reject(new Error("late operation rejection"));
			expect(await next).toBe("next");
		} finally {
			original.resolve();
			await Promise.all([cancelled, next]);
		}
	});
});

interface Deferred<T> {
	readonly promise: Promise<T>;
	readonly resolve: (value: T) => void;
	readonly reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
	let resolvePromise: ((value: T) => void) | undefined;
	let rejectPromise: ((reason: unknown) => void) | undefined;
	const promise = new Promise<T>((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
	});
	return {
		promise,
		resolve(value) {
			if (!resolvePromise) throw new Error("Deferred promise is not initialized");
			resolvePromise(value);
		},
		reject(reason) {
			if (!rejectPromise) throw new Error("Deferred promise is not initialized");
			rejectPromise(reason);
		},
	};
}
