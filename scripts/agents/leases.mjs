// Copyright The Open Forge contributors.
import { normalizeContractPath, pathsOverlap, TASK_ID_PATTERN } from "../worktree/contract.mjs";
import { contract } from "./contracts.mjs";

export const ACTIVE_RUN_STATUSES = new Set([
	"preparing",
	"running",
	"verifying",
	"integrating",
	"publishing",
	"cleanup-required",
]);

function checkedTask(task) {
	if (!TASK_ID_PATTERN.test(task.id) || task.status !== "ready") throw new Error("only a ready Task may be claimed");
	for (const field of ["writePaths", "readPaths", "exclusivePaths", "dependsOn", "conflictsWith"]) {
		if (!Array.isArray(task[field]) || task[field].some((entry) => typeof entry !== "string"))
			throw new Error(`invalid task ${field}`);
	}
	if (task.writePaths.length === 0) throw new Error("task has no write scope");
	for (const path of [...task.writePaths, ...task.readPaths, ...task.exclusivePaths]) {
		const result = normalizeContractPath(path);
		if (result.problem || path === ".git" || path.startsWith(".git/")) throw new Error(`invalid task scope: ${path}`);
	}
	return task;
}

const overlaps = (left, right) => left.some((a) => right.some((b) => pathsOverlap(a, b)));
function conflicts(task, lease) {
	return (
		task.conflictsWith.includes(lease.task) ||
		lease.conflictsWith.includes(task.id) ||
		overlaps(task.writePaths, lease.writePaths) ||
		overlaps(task.exclusivePaths, [...lease.writePaths, ...lease.readPaths, ...lease.exclusivePaths]) ||
		overlaps(lease.exclusivePaths, [...task.writePaths, ...task.readPaths])
	);
}

function validateClock(now, ttl) {
	if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(ttl) || ttl < 1 || ttl > 86400000) {
		throw new Error("invalid lease clock or TTL");
	}
}

export function assertLease(state, token, now, { allowExpired = false } = {}) {
	contract("lease", token);
	if (state.control.paused && !allowExpired) throw new Error("controller is paused");
	const lease = state.leases[token.task];
	if (
		!lease ||
		lease.status !== "active" ||
		lease.holder !== token.holder ||
		lease.runId !== token.runId ||
		lease.generation !== token.generation
	) {
		throw new Error("stale task lease");
	}
	if (!Number.isSafeInteger(now) || now < lease.acquiredAt) throw new Error("lease clock moved backwards");
	if (!allowExpired && now >= lease.expiresAt) throw new Error("task lease expired");
	return lease;
}

export function claim(store, rawTask, { holder, runId, now = Date.now(), ttl = 900000, completed = [] }) {
	const task = checkedTask(rawTask);
	validateClock(now, ttl);
	if (![holder, runId].every((value) => typeof value === "string" && /^[A-Za-z0-9:_@.-]{1,160}$/u.test(value))) {
		throw new Error("invalid lease identity");
	}
	return store.transaction((state) => {
		if (state.control.paused) throw new Error("controller is paused");
		const previous = state.leases[task.id];
		if (previous?.status === "active" && previous.expiresAt > now) {
			if (previous.holder === holder && previous.runId === runId) {
				return { task: task.id, holder, runId, generation: previous.generation };
			}
			throw new Error("task already leased");
		}
		if (Object.hasOwn(state.runs, runId)) throw new Error("run id is already recorded");
		for (const lease of Object.values(state.leases)) {
			if (lease.status !== "active") continue;
			if (lease.expiresAt <= now) {
				const run = state.runs[lease.runId];
				if (run && ACTIVE_RUN_STATUSES.has(run.status) && (lease.task === task.id || conflicts(task, lease))) {
					throw new Error("expired lease has a process alive or cleanup unconfirmed; recover it before recycling");
				}
				continue;
			}
			if (conflicts(task, lease)) throw new Error(`task scope conflict: ${lease.task}`);
		}
		if (task.dependsOn.some((id) => !completed.includes(id))) throw new Error("task dependency is not complete");
		const generation = (previous?.generation ?? 0) + 1;
		state.leases[task.id] = {
			task: task.id,
			holder,
			runId,
			generation,
			status: "active",
			acquiredAt: now,
			expiresAt: now + ttl,
			writePaths: task.writePaths,
			readPaths: task.readPaths,
			exclusivePaths: task.exclusivePaths,
			conflictsWith: task.conflictsWith,
		};
		state.audit.push({ event: "claimed", task: task.id, runId, generation, at: now });
		return { task: task.id, holder, runId, generation };
	});
}

export function renew(store, token, { now = Date.now(), ttl = 900000 } = {}) {
	validateClock(now, ttl);
	return store.transaction((state) => {
		const lease = assertLease(state, token, now);
		lease.expiresAt = now + ttl;
		return lease.expiresAt;
	});
}

export function release(store, token, now = Date.now()) {
	return store.transaction((state) => {
		const lease = assertLease(state, token, now, { allowExpired: true });
		const run = state.runs[lease.runId];
		if (run && ACTIVE_RUN_STATUSES.has(run.status)) throw new Error("cannot release a lease with a running process");
		lease.status = "released";
		lease.expiresAt = now;
		state.audit.push({ event: "released", task: token.task, runId: token.runId, at: now });
	});
}
