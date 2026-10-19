// Copyright The Open Forge contributors.
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { rewriteFrontmatterFields } from "../worktree/cli.mjs";
import { resolveWorktreePath } from "../worktree/contract.mjs";
import { requireCapability } from "./contracts.mjs";
import { assertSeparateRoots, git, snapshot } from "./git.mjs";
import { assertLease, renew } from "./leases.mjs";
import { isolatedEnvironment, runProcess } from "./process.mjs";
import { makeRunContract, taskById } from "./tasks.mjs";

export function bindRepository(store, root) {
	const repository = realpathSync(root);
	assertSeparateRoots(repository, store.root);
	const common = realpathSync(git(repository, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
	return store.transaction((state) => {
		if (state.repository && (state.repository.root !== repository || state.repository.common !== common))
			throw new Error("controller state is bound to a different repository");
		state.repository ??= { root: repository, common };
		return state.repository;
	});
}

export function taskIndexStatus(text, id, status) {
	const lines = text.split("\n");
	const matches = lines
		.map((line, index) => (line.startsWith(`| \`${id}\` |`) ? index : -1))
		.filter((index) => index >= 0);
	if (matches.length !== 1) throw new Error("Task needs exactly one status index row");
	lines[matches[0]] = lines[matches[0]].replace(/^(\| `TASK-\d{4}` \| )[^|]+/u, `$1\`${status}\` `);
	return lines.join("\n");
}

export function taskMetadata(text, updates) {
	const result = rewriteFrontmatterFields(text, updates);
	if (result.missing.length) throw new Error(`Task metadata is missing: ${result.missing.join(", ")}`);
	return result.text;
}

/** Bootstrap metadata is committed before the execution contract is fixed. Interrupted preparation is kept for recovery. */
export async function prepareTask({ root, store, policy, settings, token, tests, signal }) {
	requireCapability(policy, "implement");
	bindRepository(store, root);
	const base = snapshot(root);
	if (git(root, ["branch", "--show-current"]) !== "main") throw new Error("controller checkout must be main");
	const task = taskById(root, token.task);
	if (task.status !== "ready" || task.worktreeDeclared) throw new Error("prepare needs an unassigned ready Task");
	const indexPath = join(root, "project/tasks/README.md");
	taskIndexStatus(readFileSync(indexPath, "utf8"), task.id, "in_progress");
	assertLease(store.read(), token, Date.now());
	const artifactRoot = join(store.root, "artifacts", `prepare-${token.runId}`);
	mkdirSync(artifactRoot, { recursive: true, mode: 0o700 });
	store.transaction((state) => {
		assertLease(state, token, Date.now());
		if (state.runs[token.runId]) throw new Error("preparation is already recorded; inspect recovery status");
		state.runs[token.runId] = {
			task: task.id,
			status: "preparing",
			pid: null,
			authors: [],
			attempts: [],
			checks: [],
			review: null,
			preparation: { base: base.head, phase: "creating-worktree" },
		};
	});
	const controller = new AbortController();
	const abort = () => controller.abort();
	signal?.addEventListener("abort", abort, { once: true });
	if (signal?.aborted) controller.abort();
	const heartbeat = setInterval(() => {
		try {
			renew(store, token, { ttl: policy.limits.leaseMs });
		} catch {
			controller.abort();
		}
	}, policy.limits.heartbeatMs);
	let failure;
	let processResult;
	try {
		const result = await runProcess({
			command: ["bun", "scripts/worktree/cli.mjs", "create", "--task", task.id, "--base", base.head, "--no-setup"],
			cwd: root,
			env: isolatedEnvironment(artifactRoot),
			signal: controller.signal,
			timeoutMs: policy.limits.wallTimeMs,
			stallMs: policy.limits.stallMs,
			maxOutputBytes: policy.limits.outputBytes,
			onSpawn: (pid) =>
				store.transaction((state) => {
					assertLease(state, token, Date.now());
					state.runs[token.runId].pid = pid;
				}),
		});
		processResult = result;
		if (result.reason !== "success") throw new Error(`worktree preparation failed: ${result.reason}`);
		assertLease(store.read(), token, Date.now());
		if (snapshot(root, { clean: false }).head !== base.head)
			throw new Error("controller advanced during preparation");
		const declared = taskById(root, task.id);
		const resolved = resolveWorktreePath(declared.worktreeRaw, root);
		if (resolved.kind !== "path") throw new Error("worktree creator did not record a worktree");
		const worker = resolved.absolute;
		assertSeparateRoots(worker, store.root);
		const metadata = taskMetadata(readFileSync(join(root, task.file), "utf8"), { status: "in_progress" });
		writeFileSync(join(root, task.file), metadata);
		writeFileSync(indexPath, taskIndexStatus(readFileSync(indexPath, "utf8"), task.id, "in_progress"));
		const changed = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
			.split("\0")
			.filter(Boolean);
		if (changed.some((entry) => ![task.file, "project/tasks/README.md"].includes(entry.slice(3))))
			throw new Error("unrelated changes appeared during preparation; kept for inspection");
		git(root, ["add", "--", task.file, "project/tasks/README.md"]);
		git(root, ["diff", "--cached", "--check"]);
		git(root, [
			"commit",
			"-m",
			`docs(project): 领取并准备 ${task.id}`,
			"-m",
			"固定任务执行基线与独立 Worktree，后续结果按运行合同验收。",
			"--",
			task.file,
			"project/tasks/README.md",
		]);
		const preparedHead = snapshot(root).head;
		git(worker, ["merge", "--ff-only", preparedHead]);
		const prepared = taskById(root, task.id);
		const runContract = makeRunContract(prepared, { policy, settings }, worker, tests);
		store.transaction((state) => {
			assertLease(state, token, Date.now());
			const run = state.runs[token.runId];
			run.status = "claimed";
			run.pid = null;
			run.contract = runContract;
			run.preparation = { base: base.head, phase: "prepared", head: preparedHead, worktree: worker };
			state.audit.push({ event: "task-prepared", runId: token.runId, task: task.id, at: Date.now() });
		});
		return { task: prepared, runContract };
	} catch (error) {
		failure = error;
	} finally {
		clearInterval(heartbeat);
		signal?.removeEventListener("abort", abort);
	}
	store.transaction((state) => {
		assertLease(state, token, Date.now(), { allowExpired: true });
		const run = state.runs[token.runId];
		run.cleanupUnknown = processResult?.cleanupUnknown ?? false;
		if (run.cleanupUnknown) state.control.paused = true;
		run.status = run.cleanupUnknown ? "cleanup-required" : "preparation-failed";
		run.pid = run.cleanupUnknown ? processResult.pid : null;
		run.preparation.failure = failure.message;
		state.audit.push({ event: "preparation-failed", runId: token.runId, at: Date.now() });
	});
	throw failure;
}
