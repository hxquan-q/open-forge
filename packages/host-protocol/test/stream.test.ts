// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { type HostStreamView, reduceHostStream } from "../src/stream.js";

const add = (state: number, delta: number) => state + delta;
const empty: HostStreamView<number> = { status: "empty" };

describe("reduceHostStream", () => {
	it("ignores deltas before the first snapshot", () => {
		expect(reduceHostStream(empty, { kind: "delta", revision: 1, delta: 5 }, add)).toEqual(empty);
	});

	it("applies contiguous deltas after a snapshot", () => {
		let view = reduceHostStream(empty, { kind: "snapshot", revision: 3, state: 10 }, add);
		view = reduceHostStream(view, { kind: "delta", revision: 4, delta: 2 }, add);
		expect(view).toEqual({ status: "live", revision: 4, state: 12 });
	});

	it("drops duplicate deltas and goes stale on a gap until the next snapshot", () => {
		let view = reduceHostStream(empty, { kind: "snapshot", revision: 1, state: 0 }, add);
		view = reduceHostStream(view, { kind: "delta", revision: 1, delta: 9 }, add);
		expect(view).toEqual({ status: "live", revision: 1, state: 0 });
		view = reduceHostStream(view, { kind: "delta", revision: 3, delta: 1 }, add);
		expect(view.status).toBe("stale");
		view = reduceHostStream(view, { kind: "delta", revision: 4, delta: 1 }, add);
		expect(view.status).toBe("stale");
		view = reduceHostStream(view, { kind: "snapshot", revision: 5, state: 42 }, add);
		expect(view).toEqual({ status: "live", revision: 5, state: 42 });
	});

	it("ignores snapshots older than the current revision", () => {
		const view = reduceHostStream(empty, { kind: "snapshot", revision: 5, state: 1 }, add);
		expect(reduceHostStream(view, { kind: "snapshot", revision: 2, state: 99 }, add)).toBe(view);
	});
});
