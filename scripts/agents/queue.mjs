// Copyright The Open Forge contributors.
import { loadTasks as loadRepositoryTasks } from "../worktree/contract.mjs";
import { claim } from "./leases.mjs";

export function completedTasks(tasks) {
	return tasks
		.filter((task) => task.status === "done" && task.integrationStatus === "integrated")
		.map((task) => task.id);
}

/** Only explicitly contracted ready work enters the executor; external signals never become instructions here. */
export function taskQueue(tasks, state, now = Date.now()) {
	const completed = new Set(completedTasks(tasks));
	return tasks
		.filter((task) => task.status === "ready")
		.sort((a, b) => a.priority.localeCompare(b.priority) || a.id.localeCompare(b.id))
		.map((task) => ({
			task: task.id,
			priority: task.priority,
			waitingFor: task.dependsOn.filter((id) => !completed.has(id)),
			leased: Object.values(state.leases).some(
				(lease) => lease.task === task.id && lease.status === "active" && lease.expiresAt > now,
			),
		}));
}

/** The ledger remains the source of ready work; this only leases one non-conflicting candidate. */
export function claimNext(root, store, options, loadTasks = loadRepositoryTasks) {
	const { tasks, problems } = loadTasks(root);
	if (problems.length) throw new Error(problems.join("; "));
	const queue = taskQueue(tasks, store.read(), options.now);
	const conflicts = [];
	for (const entry of queue) {
		if (entry.leased || entry.waitingFor.length) continue;
		const task = tasks.find((candidate) => candidate.id === entry.task);
		try {
			return {
				task,
				token: claim(store, task, { ...options, completed: completedTasks(tasks) }),
				queue,
				conflicts,
			};
		} catch (error) {
			if (!/task scope conflict|task already leased/u.test(error.message)) throw error;
			conflicts.push({ task: entry.task, reason: error.message });
		}
	}
	return { task: null, token: null, queue, conflicts };
}
