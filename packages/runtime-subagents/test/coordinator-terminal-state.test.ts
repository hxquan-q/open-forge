// Copyright The Open Forge contributors.
import { describe, expect, it, vi } from "vitest";
import type { SubagentChildHandle, SubagentSnapshot } from "../src/index.js";
import { request } from "./support/builders.js";
import { createFixture } from "./support/fixture.js";
import { DelayedAbortChild, TestChild } from "./support/test-child.js";
import { waitUntil } from "./support/wait.js";

describe("SubagentCoordinator terminal state convergence", () => {
	it("delivers the member failure to the parent notification (BUG-0002)", async () => {
		const notified: SubagentSnapshot[] = [];
		const fixture = createFixture({
			notificationDelayMs: 1,
			onNotify: (agents) => notified.push(...agents),
		});
		await fixture.coordinator.spawn(request("worker"));
		const child = fixture.children[0];
		expect(child).toBeDefined();

		child?.failTurn(
			"AI_STREAM_PROTOCOL_FAILED: response.content_part.added targeted the wrong output item",
			"AI_STREAM_PROTOCOL_FAILED",
		);

		await waitUntil(() => fixture.coordinator.get("worker")?.status === "failed");
		const snapshot = fixture.coordinator.get("worker");
		expect(snapshot?.status).toBe("failed");
		expect(snapshot?.errorMessage).toContain("AI_STREAM_PROTOCOL_FAILED");

		await waitUntil(() => notified.some((agent) => agent.taskName === "worker"));
		expect(notified.find((agent) => agent.taskName === "worker")?.status).toBe("failed");
	});

	it("lets parent wait() claim the failed terminal snapshot (BUG-0002)", async () => {
		const fixture = createFixture({});
		await fixture.coordinator.spawn(request("worker"));

		fixture.children[0]?.failTurn("AI_STREAM_PROTOCOL_FAILED: stream corrupted", "AI_STREAM_PROTOCOL_FAILED");

		const waited = await fixture.coordinator.wait({ targets: ["worker"], timeoutMs: 100 });
		expect(waited.timedOut).toBe(false);
		expect(waited.agents[0]?.status).toBe("failed");
		expect(waited.agents[0]?.errorMessage).toContain("AI_STREAM_PROTOCOL_FAILED");
	});

	it("marks an externally aborted member interrupted instead of completed", async () => {
		const fixture = createFixture({});
		await fixture.coordinator.spawn(request("worker"));

		fixture.children[0]?.interruptExternally();

		await waitUntil(() => fixture.coordinator.get("worker")?.status === "interrupted");
		const waited = await fixture.coordinator.wait({ targets: ["worker"], timeoutMs: 100 });
		expect(waited.timedOut).toBe(false);
		expect(waited.agents[0]?.status).toBe("interrupted");
	});

	it("releases the concurrency slot when an interrupted child never goes idle (BUG-0001)", async () => {
		const delayed = new DelayedAbortChild("delayed-child");
		let created = 0;
		const onError = vi.fn();
		const fixture = createFixture({
			maxConcurrent: 1,
			settleDeadlineMs: 30,
			onError,
			factory: {
				async create() {
					created += 1;
					return created === 1 ? delayed : new TestChild(`child-${created}`);
				},
			},
		});
		fixture.coordinator.spawnMany([request("first"), request("second")]);
		await waitUntil(() => fixture.coordinator.get("first")?.status === "running");

		fixture.coordinator.interrupt("first");
		expect(fixture.coordinator.get("first")?.status).toBe("interrupted");

		// 成员忽略 AbortSignal：收尾宽限到期后仍必须释放槽位并让排队的成员开跑。
		await waitUntil(() => fixture.coordinator.get("second")?.status === "running");
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ message: expect.stringContaining("deadline") }),
			"settle interrupted subagent",
		);
		await fixture.coordinator.dispose();
	});

	it("fails the member when child creation never settles (BUG-0001)", async () => {
		const fixture = createFixture({
			startDeadlineMs: 30,
			factory: {
				create: () => new Promise<SubagentChildHandle>(() => {}),
			},
		});

		await expect(fixture.coordinator.spawn(request("stuck"))).rejects.toThrow(/deadline/);
		expect(fixture.coordinator.get("stuck")).toMatchObject({ status: "failed" });
		await fixture.coordinator.dispose();
	});

	it("bounds child disposal when the handle ignores dispose (BUG-0001)", async () => {
		class NeverDisposeChild extends TestChild {
			override dispose(): Promise<void> {
				return new Promise(() => {});
			}
		}
		const onError = vi.fn();
		const fixture = createFixture({
			settleDeadlineMs: 30,
			onError,
			factory: {
				async create() {
					return new NeverDisposeChild("wedged-child");
				},
			},
		});
		await fixture.coordinator.spawn(request("worker"));
		await waitUntil(() => fixture.coordinator.get("worker")?.status === "running");

		const disposal = fixture.coordinator.dispose();
		await expect(disposal).resolves.toBeUndefined();
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ message: expect.stringContaining("deadline") }),
			expect.stringContaining("dispose"),
		);
	});
});
