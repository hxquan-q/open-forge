// Modified by The Open Forge contributors.
import { createRuntimeObservationPublisher, type RuntimeObservationRecord } from "@vetta/runtime-core/observation";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	CODING_AGENT_OCR_ADMISSION_OBSERVATION,
	getCodingAgentOcrExecutionGate,
} from "../../src/tool-policy/ocr-execution-gate.js";

afterEach(() => vi.useRealTimers());

describe("Coding Agent OCR admission policy", () => {
	it("shares capacity between sessions while retaining each session's publisher identity", async () => {
		const firstRecords: RuntimeObservationRecord[] = [];
		const secondRecords: RuntimeObservationRecord[] = [];
		const firstPublisher = createRuntimeObservationPublisher({
			port: {
				record: (event) => {
					firstRecords.push(event);
				},
			},
		});
		const secondPublisher = createRuntimeObservationPublisher({
			port: {
				record: (event) => {
					secondRecords.push(event);
				},
			},
		});
		const firstGate = getCodingAgentOcrExecutionGate(1, firstPublisher);
		const secondGate = getCodingAgentOcrExecutionGate(1, secondPublisher);
		const release = deferred<void>();
		const first = firstGate.run(() => release.promise, { ownerId: "session-A", requestId: "call-A" });
		let secondStarted = false;
		const second = secondGate.run(
			async () => {
				secondStarted = true;
				return "private OCR result";
			},
			{
				ownerId: "session-B",
				requestId: "call-B",
			},
		);
		try {
			expect(secondStarted).toBe(false);
		} finally {
			release.resolve();
			await first;
			await second;
		}
		await Promise.all([firstPublisher.flush(), secondPublisher.flush()]);
		expect(firstRecords).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					token: CODING_AGENT_OCR_ADMISSION_OBSERVATION,
					context: expect.objectContaining({ sessionId: "session-A", toolCallId: "call-A" }),
				}),
			]),
		);
		expect(secondRecords).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					token: CODING_AGENT_OCR_ADMISSION_OBSERVATION,
					context: expect.objectContaining({ sessionId: "session-B", toolCallId: "call-B" }),
					payload: expect.objectContaining({ phase: "queued", activeCount: 1, queuedCount: 1 }),
				}),
			]),
		);
		expect(firstRecords.every((record) => record.context.sessionId === "session-A")).toBe(true);
		expect(secondRecords.every((record) => record.context.sessionId === "session-B")).toBe(true);
		expect(JSON.stringify([...firstRecords, ...secondRecords])).not.toContain("private OCR result");
	});

	it("limits OCR waiting to eight requests and sixty seconds without starting failed work", async () => {
		vi.useFakeTimers();
		const gate = getCodingAgentOcrExecutionGate();
		const release = deferred<void>();
		const active = gate.run(() => release.promise, { ownerId: "holder" });
		const operation = vi.fn(async () => undefined);
		const waiting = Array.from({ length: 8 }, (_, index) =>
			gate
				.run(operation, {
					ownerId: `session-${index}`,
					waitTimeoutMs: 120_000,
				})
				.catch((error: unknown) => error),
		);
		try {
			await expect(gate.run(operation)).rejects.toMatchObject({ code: "ASYNC_EXECUTION_QUEUE_FULL" });
			await vi.advanceTimersByTimeAsync(60_000);
			expect(await Promise.all(waiting)).toEqual(
				Array.from({ length: 8 }, () => expect.objectContaining({ code: "ASYNC_EXECUTION_WAIT_TIMEOUT" })),
			);
			expect(operation).not.toHaveBeenCalled();
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			release.resolve();
			await active;
			await Promise.all(waiting);
		}
		expect(await gate.run(async () => "recovered")).toBe("recovered");
	});

	it("lets a new waiting session run before another batch from the current holder", async () => {
		const gate = getCodingAgentOcrExecutionGate();
		const release = deferred<void>();
		const first = gate.run(() => release.promise, { ownerId: "A" });
		const started: string[] = [];
		const a = gate.run(
			async () => {
				started.push("A");
			},
			{ ownerId: "A" },
		);
		const b = gate.run(
			async () => {
				started.push("B");
			},
			{ ownerId: "B" },
		);
		release.resolve();
		await Promise.all([first, a, b]);
		expect(started).toEqual(["B", "A"]);
	});

	it("isolates rejected asynchronous observers from operation results", async () => {
		const gate = getCodingAgentOcrExecutionGate();
		expect(
			await gate.run(async () => 42, {
				onEvent: async () => {
					throw new Error("observer only");
				},
			}),
		).toBe(42);
		await Promise.resolve();
	});
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
