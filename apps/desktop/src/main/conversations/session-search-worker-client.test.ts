// Copyright The Open Forge contributors.
import { EventEmitter } from "node:events";
import type { Worker } from "node:worker_threads";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getProcessHealthBook, ProcessHealthBook, setProcessHealthBookForTest } from "../app-monitor/process-health.js";
import { SessionSearchWorkerClient } from "./session-search-worker-client.js";
import type { SessionSearchWorkerRequest } from "./session-search-worker-protocol.js";

class FakeWorker extends EventEmitter {
	readonly postMessage = vi.fn();
	readonly terminate = vi.fn(async () => 0);
	unref(): void {}
	asWorker(): Worker {
		return this as unknown as Worker;
	}
}

function startRequest(requestId = "req"): Extract<SessionSearchWorkerRequest, { type: "start" }> {
	return {
		type: "start",
		requestId,
		request: { query: "needle" },
		sources: [],
		roots: [],
	} as Extract<SessionSearchWorkerRequest, { type: "start" }>;
}

describe("session search worker health", () => {
	beforeEach(() => {
		setProcessHealthBookForTest(new ProcessHealthBook());
	});

	it("reports a worker crash to pending listeners instead of hanging silently", () => {
		const spawned: FakeWorker[] = [];
		const client = new SessionSearchWorkerClient(() => {
			const worker = new FakeWorker();
			spawned.push(worker);
			return worker.asWorker();
		});
		const events: { done?: boolean; error?: string }[] = [];
		client.start(startRequest(), (event) => events.push(event));

		spawned[0]?.emit("exit", 1);

		expect(events).toEqual([{ requestId: "req", done: true, error: "search-failed" }]);
		expect(getProcessHealthBook().snapshot()).toEqual([
			expect.objectContaining({ role: "session-search", kind: "worker", crashes: 1 }),
		]);
	});

	it("respawns within the restart budget and reports search-failed once exhausted", () => {
		const spawned: FakeWorker[] = [];
		const client = new SessionSearchWorkerClient(() => {
			const worker = new FakeWorker();
			spawned.push(worker);
			return worker.asWorker();
		});
		const start = (requestId: string) => {
			const events: { done?: boolean; error?: string }[] = [];
			client.start(startRequest(requestId), (event) => events.push(event));
			return events;
		};

		// 预算 3 次重生 / 5 分钟：首次启动不占预算，每次崩溃后的重生消耗一格；
		// 4 次崩溃耗尽 3 格预算后，新查询直接收到与崩溃相同的终态错误、不再 spawn。
		for (let i = 0; i < 4; i += 1) {
			const events = start(`req-${i}`);
			spawned[spawned.length - 1]?.emit("error", new Error("boom"));
			expect(events[0]?.error).toBe("search-failed");
		}
		expect(getProcessHealthBook().snapshot()[0]).toMatchObject({ crashes: 4, restarts: 3 });

		const events = start("req-final");
		expect(spawned).toHaveLength(4);
		expect(events).toEqual([{ requestId: "req-final", done: true, error: "search-failed" }]);
		expect(getProcessHealthBook().snapshot()[0]?.restartBudgetExhausted).toBe(true);
	});
});
