// Copyright The Open Forge contributors.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertLease, claim, release, renew } from "./leases.mjs";
import { createStore } from "./store.mjs";

const roots = [];
const task = (id, path = "packages/ai") => ({
	id,
	status: "ready",
	writePaths: [path],
	readPaths: [],
	exclusivePaths: [],
	dependsOn: [],
	conflictsWith: [],
});
function store() {
	const root = mkdtempSync(join(tmpdir(), "forge-autonomy-lease-"));
	roots.push(root);
	return createStore(join(root, "state"));
}
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("task ownership through the full lease lifetime", () => {
	it("claims idempotently, renews, releases, and fences the previous holder", () => {
		const state = store();
		const one = task("TASK-0001");
		const token = claim(state, one, { holder: "runner:one", runId: "run-one", now: 100, ttl: 1000 });
		expect(claim(state, one, { holder: "runner:one", runId: "run-one", now: 110, ttl: 1000 })).toEqual(token);
		renew(state, token, { now: 200, ttl: 1000 });
		assertLease(state.read(), token, 300);
		release(state, token, 400);
		const next = claim(state, one, { holder: "runner:two", runId: "run-two", now: 500, ttl: 1000 });
		expect(next.generation).toBe(token.generation + 1);
		expect(() => assertLease(state.read(), token, 600)).toThrow(/stale/);
	});
	it("blocks write/read-exclusive overlaps and unmet dependencies", () => {
		const state = store();
		claim(state, task("TASK-0001"), { holder: "one", runId: "one", now: 100, ttl: 1000 });
		expect(() =>
			claim(state, task("TASK-0002", "packages/ai/src"), { holder: "two", runId: "two", now: 101, ttl: 1000 }),
		).toThrow(/conflict/);
		const dependent = { ...task("TASK-0003", "apps/docs-site"), dependsOn: ["TASK-0001"] };
		expect(() => claim(state, dependent, { holder: "three", runId: "three", now: 101, ttl: 1000 })).toThrow(
			/dependency/,
		);
	});
	it("rejects expired results and refuses to recycle an expired lease while its process is alive", () => {
		const state = store();
		const one = task("TASK-0001");
		const token = claim(state, one, { holder: "one", runId: "one", now: 100, ttl: 1000 });
		state.transaction((data) => {
			data.runs.one = { status: "running", pid: process.pid };
		});
		expect(() => assertLease(state.read(), token, 1100)).toThrow(/expired/);
		expect(() => claim(state, one, { holder: "two", runId: "two", now: 1200, ttl: 1000 })).toThrow(/alive/);
		state.transaction((data) => {
			data.runs.one.status = "cancelled";
		});
		const next = claim(state, one, { holder: "two", runId: "two", now: 1200, ttl: 1000 });
		expect(next.generation).toBe(2);
	});
});
