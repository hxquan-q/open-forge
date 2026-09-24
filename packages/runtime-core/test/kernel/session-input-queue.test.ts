// Modified by The Open Forge contributors.
import type { UserMessage } from "@vetta/ai";
import { describe, expect, it } from "vitest";
import { SessionInputQueue } from "../../src/kernel/index.js";

function input(text: string): { readonly message: UserMessage } {
	return {
		message: {
			role: "user",
			content: text,
			timestamp: 1,
		},
	};
}

describe("SessionInputQueue", () => {
	it("consumes steering and follow-up queues independently one item at a time by default", () => {
		const queue = new SessionInputQueue();
		queue.steer(input("steer-1"));
		queue.steer(input("steer-2"));
		queue.followUp(input("follow-up-1"));
		queue.followUp(input("follow-up-2"));

		expect(queue.pendingCount).toBe(4);
		expect(queue.takeSteering().map((message) => message.content)).toEqual(["steer-1"]);
		expect(queue.takeFollowUps().map((message) => message.content)).toEqual(["follow-up-1"]);
		expect(queue.takeSteering().map((message) => message.content)).toEqual(["steer-2"]);
		expect(queue.takeFollowUps().map((message) => message.content)).toEqual(["follow-up-2"]);
		expect(queue.pendingCount).toBe(0);
	});

	it("supports switching either queue to all-at-once consumption", () => {
		const queue = new SessionInputQueue({
			steeringMode: "all",
		});
		queue.steer(input("steer-1"));
		queue.steer(input("steer-2"));
		queue.followUp(input("follow-up-1"));
		queue.followUp(input("follow-up-2"));
		queue.setFollowUpMode("all");

		expect(queue.takeSteering().map((message) => message.content)).toEqual(["steer-1", "steer-2"]);
		expect(queue.takeFollowUps().map((message) => message.content)).toEqual(["follow-up-1", "follow-up-2"]);
	});

	it("returns and clears pending inputs without exposing mutable queue storage", () => {
		const queue = new SessionInputQueue();
		queue.steer(input("steer"));
		queue.followUp(input("follow-up"));

		const visibleSteering = queue.steeringInputs;
		const cleared = queue.clear();

		expect(visibleSteering).toHaveLength(1);
		expect(cleared.steering.flatMap(({ message }) => (message ? [message.content] : []))).toEqual(["steer"]);
		expect(cleared.followUps.flatMap(({ message }) => (message ? [message.content] : []))).toEqual(["follow-up"]);
		expect(queue.pendingCount).toBe(0);
	});

	it("appends policy-produced messages to the ordinary follow-up queue", () => {
		const queue = new SessionInputQueue();
		queue.followUp(input("user follow-up"));
		queue.enqueueFollowUps([input("policy follow-up").message]);

		expect(queue.takeFollowUps().map((message) => message.content)).toEqual(["user follow-up"]);
		expect(queue.takeFollowUps().map((message) => message.content)).toEqual(["policy follow-up"]);
		expect(queue.pendingCount).toBe(0);
	});

	it("keeps context-only steering and follow-up inputs for the runtime engine", () => {
		const queue = new SessionInputQueue();
		queue.enqueueContext("steer", [{ type: "extension", content: "steer context", modelVisible: true }]);
		queue.enqueueContext("followUp", [{ type: "extension", content: "follow-up context", modelVisible: true }]);

		expect(queue.takeSteering()).toEqual([]);
		expect(queue.takeFollowUpInputs?.()).toEqual([
			{
				context: [{ type: "extension", content: "follow-up context", modelVisible: true }],
			},
		]);
		expect(queue.pendingCount).toBe(0);
	});

	it("stamps entries with the injected clock and emits enqueuedAt in snapshots", () => {
		let now = 1_000;
		const queue = new SessionInputQueue({ now: () => now });
		const { id } = queue.enqueueWithId("followUp", input("queued"));

		expect(queue.list().entries.find((entry) => entry.id === id)?.enqueuedAt).toBe(1_000);

		now = 2_500;
		queue.enqueueFollowUps([input("policy").message]);
		const policyEntry = queue.list().entries.find((entry) => entry.id !== id);
		expect(policyEntry?.enqueuedAt).toBe(2_500);
	});

	it("preserves enqueuedAt across restore and backfills legacy snapshots with restore time", () => {
		let now = 5_000;
		const source = new SessionInputQueue({ now: () => now });
		const { id } = source.enqueueWithId("followUp", input("queued"));

		now = 9_000;
		const restored = new SessionInputQueue({ now: () => now });
		restored.restore(source.list());
		expect(restored.list().entries.find((entry) => entry.id === id)?.enqueuedAt).toBe(5_000);

		now = 12_000;
		const legacy = new SessionInputQueue({ now: () => now });
		legacy.restore({
			paused: false,
			entries: [{ id: "legacy-1", behavior: "followUp", input: input("old") }],
		});
		expect(legacy.list().entries[0]?.enqueuedAt).toBe(12_000);
	});

	it("requeue preserves entry identity and original enqueue timestamp", () => {
		let now = 100;
		const queue = new SessionInputQueue({ now: () => now });
		const { id } = queue.enqueueWithId("followUp", input("rollback"));

		now = 300;
		const taken = queue.takeById(id);
		expect(taken?.id).toBe(id);
		expect(taken?.enqueuedAt).toBe(100);

		now = 400;
		queue.requeue(taken as NonNullable<typeof taken>);
		const entry = queue.list().entries.find((candidate) => candidate.id === id);
		expect(entry?.enqueuedAt).toBe(100);
		expect(entry?.input.message?.content).toBe("rollback");
	});
});
