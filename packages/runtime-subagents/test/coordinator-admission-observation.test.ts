// Modified by The Open Forge contributors.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SubagentChildHandle, SubagentSchedulingEvent } from "../src/index.js";
import { request, snapshot } from "./support/builders.js";
import { createFixture } from "./support/fixture.js";
import { DelayedAbortChild, TestChild } from "./support/test-child.js";

afterEach(() => vi.useRealTimers());

describe("SubagentCoordinator admission observation", () => {
	it("observes queued work, FIFO admission and release without exposing task content", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000);
		const events: SubagentSchedulingEvent[] = [];
		const admitted = deferred<void>();
		const fixture = createFixture({
			maxConcurrent: 1,
			onSchedulingEvent: (event) => {
				events.push(event);
				if (events.filter(({ phase }) => phase === "admitted").length === 2) admitted.resolve();
			},
		});
		try {
			await fixture.coordinator.spawn({
				...request("private_first"),
				message: "secret prompt",
				title: "secret title",
			});
			fixture.coordinator.spawnMany([request("private_second")]);
			expect(events.map(({ phase }) => phase)).toEqual(["admitted", "queued"]);
			vi.setSystemTime(1_250);
			fixture.children[0]?.complete("secret final text");
			await admitted.promise;
			expect(events.map(({ phase }) => phase)).toEqual(["admitted", "queued", "released", "admitted"]);
			expect(events[2]).toMatchObject({
				phase: "released",
				reason: "completed",
				childSessionId: "child-1",
				generation: 1,
				activeCount: 0,
				queuedCount: 1,
				heldMs: 250,
			});
			expect(events[3]).toMatchObject({ phase: "admitted", activeCount: 1, queuedCount: 0, waitMs: 250 });
			expect(events[0]?.admissionId).toBe(events[2]?.admissionId);
			expect(events[1]?.admissionId).toBe(events[3]?.admissionId);
			expect(events[0]?.childSessionId).toBeUndefined();
			const serialized = JSON.stringify(events);
			for (const secret of [
				"private_first",
				"private_second",
				"secret prompt",
				"secret title",
				"secret final text",
				".subagents/",
			]) {
				expect(serialized).not.toContain(secret);
			}
		} finally {
			await fixture.coordinator.dispose();
		}
	});

	it("reports capacity rejection without reserving or exposing the rejected request", async () => {
		const events: SubagentSchedulingEvent[] = [];
		const fixture = createFixture({
			maxConcurrent: 1,
			onSchedulingEvent: (event) => {
				events.push(event);
			},
		});
		try {
			await fixture.coordinator.spawn(request("active"));
			await expect(fixture.coordinator.spawn(request("secret_rejected"))).rejects.toThrow(
				"Too many active subagents",
			);
			expect(events.at(-1)).toMatchObject({ phase: "rejected", reason: "capacity", activeCount: 1, queuedCount: 0 });
			expect(events.at(-1)?.admissionId).toBeUndefined();
			expect(fixture.children).toHaveLength(1);
			expect(JSON.stringify(events)).not.toContain("secret_rejected");
		} finally {
			await fixture.coordinator.dispose();
		}
	});

	it("releases a cancelled queued admission without starting a child or claiming an active slot", async () => {
		const events: SubagentSchedulingEvent[] = [];
		const released = deferred<void>();
		const fixture = createFixture({
			maxConcurrent: 1,
			onSchedulingEvent: (event) => {
				events.push(event);
				if (event.phase === "released") released.resolve();
			},
		});
		try {
			await fixture.coordinator.spawn(request("first"));
			fixture.coordinator.spawnMany([request("queued")]);
			fixture.coordinator.interrupt("queued");
			await released.promise;
			expect(events.at(-1)).toMatchObject({
				phase: "released",
				reason: "cancelled-before-start",
				activeCount: 1,
				queuedCount: 0,
			});
			expect(events.at(-1)?.heldMs).toBeUndefined();
			expect(events.filter(({ phase }) => phase === "admitted")).toHaveLength(1);
			expect(fixture.children).toHaveLength(1);
		} finally {
			await fixture.coordinator.dispose();
		}
	});

	it("distinguishes the interrupted terminal from bounded settlement and FIFO refill", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		const delayed = new DelayedAbortChild("slow-child");
		const next = new TestChild("next-child");
		const events: SubagentSchedulingEvent[] = [];
		let created = 0;
		const fixture = createFixture({
			maxConcurrent: 1,
			onSchedulingEvent: (event) => {
				events.push(event);
			},
			factory: { create: async () => (++created === 1 ? delayed : next) },
		});
		try {
			await fixture.coordinator.spawn(request("first"));
			fixture.coordinator.spawnMany([request("second")]);
			fixture.coordinator.interrupt("first");
			expect(fixture.coordinator.get("first")?.status).toBe("interrupted");
			expect(events.at(-1)).toMatchObject({ phase: "settling", activeCount: 1, queuedCount: 1 });
			await vi.advanceTimersByTimeAsync(9_999);
			expect(created).toBe(1);
			expect(events.some(({ phase }) => phase === "released")).toBe(false);
			await vi.advanceTimersByTimeAsync(1);
			expect(events.slice(-3).map(({ phase }) => phase)).toEqual(["settle-deadline", "released", "admitted"]);
			expect(events.at(-2)).toMatchObject({ reason: "settle-deadline", heldMs: 10_000, activeCount: 0 });
			expect(created).toBe(2);
		} finally {
			delayed.releaseAbort();
			await fixture.coordinator.dispose();
		}
	});

	it("uses a new admission for follow-up while preserving the existing terminal generation semantics", async () => {
		const events: SubagentSchedulingEvent[] = [];
		const released = deferred<void>();
		const fixture = createFixture({
			onSchedulingEvent: (event) => {
				events.push(event);
				if (event.phase === "released") released.resolve();
			},
		});
		try {
			await fixture.coordinator.spawn(request("retained"));
			fixture.children[0]?.complete("done");
			await released.promise;
			await fixture.coordinator.followUp("retained", "continue privately");
			const admissions = events.filter(({ phase }) => phase === "admitted");
			expect(admissions.map(({ generation }) => generation)).toEqual([0, 1]);
			expect(admissions[1]?.childSessionId).toBe("child-1");
			expect(admissions[0]?.admissionId).not.toBe(admissions[1]?.admissionId);
			expect(fixture.coordinator.get("retained")?.generation).toBe(1);
			expect(JSON.stringify(events)).not.toContain("continue privately");
		} finally {
			await fixture.coordinator.dispose();
		}
	});

	it.each(["sync", "async"] as const)("keeps scheduling usable when a %s observer fails", async (mode) => {
		const completed = deferred<void>();
		const fixture = createFixture({
			maxConcurrent: 1,
			onUpdate: (agents) => {
				if (agents.some(({ status }) => status === "completed")) completed.resolve();
			},
			onSchedulingEvent: () => {
				if (mode === "async") return Promise.reject(new Error("observer failed"));
				throw new Error("observer failed");
			},
		});
		try {
			await expect(fixture.coordinator.spawn(request("first"))).resolves.toMatchObject({ status: "running" });
			fixture.children[0]?.complete("done");
			await completed.promise;
			await expect(fixture.coordinator.followUp("first", "again")).resolves.toMatchObject({ status: "running" });
		} finally {
			await fixture.coordinator.dispose();
		}
	});

	it("retains the recovered child identity and generation on a newly admitted follow-up", async () => {
		const events: SubagentSchedulingEvent[] = [];
		const fixture = createFixture({
			reopen: true,
			onSchedulingEvent: (event) => {
				events.push(event);
			},
		});
		fixture.coordinator.restore({
			agents: [
				snapshot("recovered-child", "interrupted", {
					taskName: "recovered_task",
					path: "/root/recovered_task",
					generation: 3,
					sessionFile: "private-file.jsonl",
				}),
			],
			delivered: [],
		});
		try {
			await fixture.coordinator.followUp("recovered-child", "private resumed objective");
			expect(events[0]).toMatchObject({ phase: "admitted", childSessionId: "recovered-child", generation: 3 });
			expect(JSON.stringify(events)).not.toContain("private");
		} finally {
			await fixture.coordinator.dispose();
		}
	});

	it("keeps a bound child identity across follow-up when the child has no session file", async () => {
		const child = new TestChild("ephemeral-child");
		const handle: SubagentChildHandle = {
			sessionId: child.sessionId,
			prompt: (text) => child.prompt(text),
			sendMessage: () => child.sendMessage(),
			followUp: (text) => child.followUp(text),
			abort: () => child.abort(),
			waitForIdle: () => child.waitForIdle(),
			isStreaming: () => child.isStreaming(),
			getLastAssistantText: () => child.getLastAssistantText(),
			dispose: () => child.dispose(),
			subscribe: (listener) => child.subscribe(listener),
		};
		const events: SubagentSchedulingEvent[] = [];
		const released = deferred<void>();
		const fixture = createFixture({
			factory: { create: async () => handle },
			onSchedulingEvent: (event) => {
				events.push(event);
				if (event.phase === "released") released.resolve();
			},
		});
		try {
			await fixture.coordinator.spawn(request("ephemeral"));
			child.complete("done");
			await released.promise;
			await fixture.coordinator.followUp("ephemeral", "continue");
			expect(events.filter(({ phase }) => phase === "admitted")[1]).toMatchObject({
				childSessionId: "ephemeral-child",
				generation: 1,
			});
		} finally {
			await fixture.coordinator.dispose();
		}
	});

	it("observes a failed start releasing its admission without publishing the failure text", async () => {
		const events: SubagentSchedulingEvent[] = [];
		const fixture = createFixture({
			factory: {
				create: async () => {
					throw new Error("private failure detail");
				},
			},
			onSchedulingEvent: (event) => {
				events.push(event);
			},
		});
		try {
			await expect(fixture.coordinator.spawn(request("secret_start"))).rejects.toThrow("private failure detail");
			expect(events.map(({ phase }) => phase)).toEqual(["admitted", "released"]);
			expect(events[1]).toMatchObject({ reason: "failed", activeCount: 0, generation: 1 });
			expect(JSON.stringify(events)).not.toContain("private failure detail");
			expect(JSON.stringify(events)).not.toContain("secret_start");
		} finally {
			await fixture.coordinator.dispose();
		}
	});

	it("reports a natural stop hook deadline before releasing and refilling the slot", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		let hang = true;
		const events: SubagentSchedulingEvent[] = [];
		const fixture = createFixture({
			maxConcurrent: 1,
			lifecycle: { beforeStop: async () => (hang ? new Promise(() => {}) : undefined) },
			onSchedulingEvent: (event) => {
				events.push(event);
			},
		});
		try {
			await fixture.coordinator.spawn(request("first"));
			fixture.coordinator.spawnMany([request("second")]);
			fixture.children[0]?.complete("done");
			await vi.advanceTimersByTimeAsync(10_000);
			expect(events.slice(-3).map(({ phase }) => phase)).toEqual(["settle-deadline", "released", "admitted"]);
			expect(events.at(-2)).toMatchObject({ reason: "settle-deadline", heldMs: 10_000 });
			expect(fixture.coordinator.get("first")?.status).toBe("completed");
			expect(fixture.children).toHaveLength(2);
		} finally {
			hang = false;
			await fixture.coordinator.dispose();
		}
	});

	it("ignores a previous execution's stop deadline after interruption and follow-up", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		const oldStop = deferred<undefined>();
		let firstStop = true;
		const events: SubagentSchedulingEvent[] = [];
		const released = deferred<void>();
		const fixture = createFixture({
			lifecycle: {
				beforeStop: async () => {
					if (!firstStop) return undefined;
					firstStop = false;
					return oldStop.promise;
				},
			},
			onSchedulingEvent: (event) => {
				events.push(event);
				if (event.phase === "released") released.resolve();
			},
		});
		try {
			await fixture.coordinator.spawn(request("retained"));
			fixture.children[0]?.complete("first result");
			await vi.advanceTimersByTimeAsync(1_000);
			fixture.coordinator.interrupt("retained");
			await released.promise;
			await fixture.coordinator.followUp("retained", "new execution");
			const nextAdmission = events.at(-1)?.admissionId;
			await vi.advanceTimersByTimeAsync(9_000);
			expect(events.filter(({ admissionId }) => admissionId === nextAdmission).map(({ phase }) => phase)).toEqual([
				"admitted",
			]);
			expect(fixture.coordinator.get("retained")).toMatchObject({ status: "running", generation: 1 });
		} finally {
			oldStop.resolve(undefined);
			await fixture.coordinator.dispose();
		}
	});
});

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
