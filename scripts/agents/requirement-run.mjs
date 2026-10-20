// Copyright The Open Forge contributors.
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isInside, loadTasks, normalizeContractPath, pathsOverlap } from "../worktree/contract.mjs";
import { asList, asText, firstToken } from "../worktree/frontmatter.mjs";
import { requireCapability } from "./contracts.mjs";
import { cycle, loopLimits } from "./orchestrate.mjs";
import { completedTasks } from "./queue.mjs";
import { assertSchema } from "./schema.mjs";

const SCHEMA = JSON.parse(
	readFileSync(fileURLToPath(new URL("../../schemas/agents/requirement-run.schema.json", import.meta.url)), "utf8"),
);
const SCHEMA_PATTERN = /[*?[\]]/u;
const REASON_LIMIT = 4000;
const NOT_RUN_LIMIT = 1000;

const schemaFor = (name) => ({ $defs: SCHEMA.$defs, $ref: `#/$defs/${name}` });
const unique = (values) => [...new Set(values)];
const truncate = (value, length) => (value.length > length ? `${value.slice(0, length - 1)}…` : value);

function fieldIds(task, scalar, list) {
	return new Set(
		[asText(task.fields, scalar), ...asList(task.fields, list)].map((value) => firstToken(value)).filter(Boolean),
	);
}

function belongsTo(task, requirement, plan) {
	const requirements = fieldIds(task, "requirement", "related_requirement");
	const plans = fieldIds(task, "plan", "related_plan");
	return requirements.has(requirement) && plans.has(plan);
}

/** Engineering closure is integration plus verification/done; it is not user acceptance. */
export function engineeringComplete(task) {
	return task.integrationStatus === "integrated" && (task.status === "verifying" || task.status === "done");
}

function evidenceCheck(root, rootReal, raw) {
	const normalized = normalizeContractPath(raw);
	if (normalized.problem) return { path: raw, problem: normalized.problem };
	if (SCHEMA_PATTERN.test(normalized.path)) {
		return { path: normalized.path, problem: "evidence must name a concrete file, not a glob" };
	}
	if (normalized.path === ".git" || normalized.path.startsWith(".git/")) {
		return { path: normalized.path, problem: "evidence must not live under .git" };
	}
	let real;
	try {
		real = realpathSync(join(root, normalized.path));
	} catch {
		return { path: normalized.path, problem: `evidence file does not exist: ${normalized.path}` };
	}
	if (!isInside(rootReal, real)) {
		return { path: normalized.path, problem: `evidence escapes the repository: ${normalized.path}` };
	}
	let stat;
	try {
		stat = statSync(real);
	} catch (error) {
		return { path: normalized.path, problem: `cannot stat evidence ${normalized.path}: ${error.message}` };
	}
	if (!stat.isFile()) return { path: normalized.path, problem: `evidence is not a file: ${normalized.path}` };
	if (stat.size === 0) return { path: normalized.path, problem: `evidence file is empty: ${normalized.path}` };
	return { path: normalized.path, problem: null };
}

function clauseView(root, rootReal, clause, byId) {
	const missingEvidence = [];
	const refs = [];
	let engineeringCount = 0;
	for (const ref of clause.tasks) {
		const task = byId.get(ref.id);
		const engineering = task ? engineeringComplete(task) : false;
		if (engineering) engineeringCount += 1;
		const missing = ref.evidence.filter((path) => evidenceCheck(root, rootReal, path).problem);
		missingEvidence.push(...missing);
		refs.push({ id: ref.id, evidence: ref.evidence, engineering, missingEvidence: missing });
	}
	const status =
		engineeringCount === clause.tasks.length && missingEvidence.length === 0
			? "covered"
			: engineeringCount > 0
				? "partial"
				: "missing";
	const acceptance = clause.tasks.every((ref) => byId.get(ref.id)?.status === "done") ? "accepted" : "pending";
	return {
		id: clause.id,
		text: clause.text,
		status,
		acceptance,
		tasks: clause.tasks.map((ref) => ref.id),
		missingEvidence: unique(missingEvidence),
		refs,
	};
}

function overallAcceptance(clauses) {
	if (clauses.length === 0) return "not-applicable";
	return clauses.every((clause) => clause.acceptance === "accepted") ? "accepted" : "pending";
}

/**
 * Validate the manifest and build the clause/task matrix. Structural problems are returned
 * rather than thrown so `requirement-check` can print the actual gap instead of a stack trace.
 */
export function validateCoverage({ root, requirement, plan, coverage, tasks }) {
	const problems = [];
	const warnings = [];
	const loaded = tasks ? null : loadTasks(root);
	const taskList = tasks ?? loaded?.tasks ?? [];
	if (loaded?.problems?.length) {
		problems.push(...loaded.problems);
		return {
			problems,
			warnings,
			clauses: [],
			tasks: [],
			unmappedTasks: [],
			complete: false,
			acceptance: "not-applicable",
		};
	}
	let rootReal;
	try {
		rootReal = realpathSync(root);
	} catch (error) {
		problems.push(`cannot resolve repository root: ${error.message}`);
		return {
			problems,
			warnings,
			clauses: [],
			tasks: [],
			unmappedTasks: [],
			complete: false,
			acceptance: "not-applicable",
		};
	}
	if (!coverage || typeof coverage !== "object" || Array.isArray(coverage)) {
		problems.push("coverage manifest must be a JSON object");
		return {
			problems,
			warnings,
			clauses: [],
			tasks: [],
			unmappedTasks: [],
			complete: false,
			acceptance: "not-applicable",
		};
	}
	try {
		assertSchema(schemaFor("coverage"), coverage);
	} catch (error) {
		problems.push(error.message);
		return {
			problems,
			warnings,
			clauses: [],
			tasks: [],
			unmappedTasks: [],
			complete: false,
			acceptance: "not-applicable",
		};
	}
	if (coverage.requirement !== requirement) {
		problems.push(`coverage manifest targets ${coverage.requirement}, expected ${requirement}`);
	}
	if (coverage.plan !== plan) {
		problems.push(`coverage manifest targets ${coverage.plan}, expected ${plan}`);
	}

	const byId = new Map(taskList.map((task) => [task.id, task]));
	const clauseIds = new Set();
	const mapped = new Map();
	const clauses = [];
	const reportedProblems = new Set();
	const reportProblem = (message) => {
		if (reportedProblems.has(message)) return;
		reportedProblems.add(message);
		problems.push(message);
	};

	for (const clause of coverage.clauses) {
		if (clauseIds.has(clause.id)) reportProblem(`duplicate clause id: ${clause.id}`);
		clauseIds.add(clause.id);
		const seenRefs = new Set();
		for (const ref of clause.tasks) {
			if (seenRefs.has(ref.id)) reportProblem(`clause ${clause.id} repeats Task ${ref.id}`);
			seenRefs.add(ref.id);
			const task = byId.get(ref.id);
			if (!task) {
				reportProblem(`clause ${clause.id} references unknown Task ${ref.id}`);
				continue;
			}
			for (const finding of task.findings) {
				if (finding.level === "error") reportProblem(`${ref.id}: ${finding.message}`);
			}
			if (!belongsTo(task, requirement, plan)) {
				reportProblem(`Task ${ref.id} does not belong to ${requirement}/${plan}`);
			}
			if (!mapped.has(ref.id)) mapped.set(ref.id, []);
			mapped.get(ref.id).push(clause.id);
			for (const evidence of ref.evidence) {
				const checked = evidenceCheck(root, rootReal, evidence);
				if (checked.problem) {
					reportProblem(`clause ${clause.id} Task ${ref.id}: ${checked.problem}`);
				}
			}
		}
		clauses.push(clauseView(root, rootReal, clause, byId));
	}

	const unmappedTasks = taskList
		.filter((task) => belongsTo(task, requirement, plan) && !mapped.has(task.id))
		.map((task) => task.id)
		.sort();
	for (const id of unmappedTasks) {
		warnings.push(`Task ${id} belongs to ${requirement}/${plan} but is not mapped in the coverage manifest`);
	}

	const clauseIdsByTask = new Map();
	for (const clause of clauses) {
		for (const id of clause.tasks) {
			if (!clauseIdsByTask.has(id)) clauseIdsByTask.set(id, []);
			clauseIdsByTask.get(id).push(clause.id);
		}
	}
	const taskViews = [...clauseIdsByTask.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([id, ids]) => {
			const task = byId.get(id);
			return {
				id,
				status: task?.status ?? "missing",
				integrationStatus: task?.integrationStatus ?? "missing",
				engineering: task ? engineeringComplete(task) : false,
				acceptance: task?.status === "done",
				clauses: unique(ids),
			};
		});

	const complete = clauses.length > 0 && clauses.every((clause) => clause.status === "covered");
	return {
		problems: unique(problems),
		warnings: unique(warnings),
		clauses,
		tasks: taskViews,
		unmappedTasks,
		complete,
		acceptance: overallAcceptance(clauses),
	};
}

/** The R1..Rn → Task → evidence → engineering/acceptance matrix, without executing anything. */
export function coverageMatrix(options) {
	const analysis = validateCoverage(options);
	return {
		clauses: analysis.clauses,
		tasks: analysis.tasks,
		unmappedTasks: analysis.unmappedTasks,
	};
}

/** Static check. `runnable` is false only for structural gaps; `complete` is a stronger claim. */
export function checkRequirement({ root, requirement, plan, coverage, tasks }) {
	const analysis = validateCoverage({ root, requirement, plan, coverage, tasks });
	return {
		requirement,
		plan,
		runnable: analysis.problems.length === 0,
		complete: analysis.complete,
		stopReason: analysis.complete ? "engineering-complete" : "coverage-gap",
		humanAcceptance: analysis.acceptance,
		release: "not-authorized",
		evidenceCheck: "presence-only",
		semanticReview: "not-performed",
		clauses: analysis.clauses,
		tasks: analysis.tasks,
		unmappedTasks: analysis.unmappedTasks,
		problems: analysis.problems,
		warnings: analysis.warnings,
	};
}

export function validateRequirementReport(value) {
	return assertSchema(schemaFor("report"), value);
}

export function requirementRunPrefix(store) {
	return `requirement-${new Date().toISOString().replace(/[^0-9]/gu, "-")}-${store.read().revision}-${process.pid}`;
}

function capabilityStop(policy, through) {
	try {
		if (through === "integrate") requireCapability(policy, "integrate-dev");
		requireCapability(policy, "implement");
		requireCapability(policy, "review");
		requireCapability(policy, "verify");
		return null;
	} catch (error) {
		const paused = through !== "integrate" && /autonomy is paused/u.test(error.message);
		return { stopReason: paused ? "paused" : "needs-human", reason: error.message };
	}
}

function activeLeases(state, now) {
	return Object.values(state.leases).filter((lease) => lease.status === "active" && lease.expiresAt > now);
}

function overlaps(left, right) {
	return left.some((a) => right.some((b) => pathsOverlap(a, b)));
}

function leaseConflicts(task, lease) {
	return (
		task.conflictsWith.includes(lease.task) ||
		(lease.conflictsWith ?? []).includes(task.id) ||
		overlaps(task.writePaths, lease.writePaths ?? []) ||
		overlaps(task.exclusivePaths, [
			...(lease.writePaths ?? []),
			...(lease.readPaths ?? []),
			...(lease.exclusivePaths ?? []),
		]) ||
		overlaps(lease.exclusivePaths ?? [], [...task.writePaths, ...task.readPaths])
	);
}

function mappedTaskIds(analysis) {
	return unique(analysis.clauses.flatMap((clause) => clause.tasks));
}

function evaluateMappedTasks({ analysis, tasks, state, attemptedTasks, now }) {
	const byId = new Map(tasks.map((task) => [task.id, task]));
	const completed = new Set(completedTasks(tasks));
	const leases = activeLeases(state, now);
	const candidates = [];
	const waiting = [];
	const leased = [];
	const conflicts = [];
	const notReady = [];

	for (const id of mappedTaskIds(analysis)) {
		const task = byId.get(id);
		if (!task) {
			notReady.push({ task: { id, status: "missing" }, reason: "task-not-found" });
			continue;
		}
		if (engineeringComplete(task)) continue;
		if (task.status !== "ready") {
			notReady.push({ task, reason: `status:${task.status || "unknown"}` });
			continue;
		}
		if (attemptedTasks.has(id)) {
			notReady.push({ task, reason: "already-attempted" });
			continue;
		}
		const pending = task.dependsOn.filter((dependency) => !completed.has(dependency));
		if (pending.length) {
			waiting.push({ task, waitingFor: pending });
			continue;
		}
		if (leases.some((lease) => lease.task === id)) {
			leased.push(id);
			continue;
		}
		const conflict = leases.find((lease) => leaseConflicts(task, lease));
		if (conflict) {
			conflicts.push({ task: id, reason: `task scope conflict: ${conflict.task}` });
			continue;
		}
		candidates.push(task);
	}

	candidates.sort((left, right) => left.priority.localeCompare(right.priority) || left.id.localeCompare(right.id));
	return { candidate: candidates[0] ?? null, waiting, leased, conflicts, notReady };
}

function diagnoseNoCandidate({ waiting, leased, conflicts, notReady }, { byId, verifiedAwaitingIntegration }) {
	if (verifiedAwaitingIntegration.size > 0) {
		return {
			stopReason: "needs-human",
			reason: `verified but not integrated: ${[...verifiedAwaitingIntegration].join(", ")}; integration was not requested`,
		};
	}
	const blockedByVerifying = waiting.find((entry) =>
		entry.waitingFor.some((id) => {
			const dependency = byId.get(id);
			return (
				dependency &&
				(dependency.status === "verifying" ||
					(dependency.status === "done" && dependency.integrationStatus !== "integrated"))
			);
		}),
	);
	if (blockedByVerifying) {
		return {
			stopReason: "needs-human",
			reason: `${blockedByVerifying.task.id} waits for ${blockedByVerifying.waitingFor.join(", ")}; a verifying or unintegrated dependency needs human acceptance/integration`,
		};
	}
	if (conflicts.length > 0) {
		return { stopReason: "blocked", reason: conflicts.map((entry) => `${entry.task}: ${entry.reason}`).join("; ") };
	}
	if (leased.length > 0) {
		return { stopReason: "blocked", reason: `mapped Task(s) already leased: ${leased.join(", ")}` };
	}
	if (waiting.length > 0) {
		return {
			stopReason: "blocked",
			reason: waiting.map((entry) => `${entry.task.id} waits for ${entry.waitingFor.join(", ")}`).join("; "),
		};
	}
	const needingHuman = notReady.find(
		(entry) =>
			entry.task.status === "verifying" ||
			(entry.task.status === "done" && entry.task.integrationStatus !== "integrated"),
	);
	if (needingHuman) {
		return {
			stopReason: "needs-human",
			reason: `${needingHuman.task.id} is ${needingHuman.task.status} without engineering completion; human acceptance or integration is required`,
		};
	}
	if (notReady.length > 0) {
		if (notReady.every((entry) => entry.reason === "already-attempted")) {
			return { stopReason: "stalled", reason: "no further mapped Task after the attempts" };
		}
		return {
			stopReason: "blocked",
			reason: notReady.map((entry) => `${entry.task.id}: ${entry.reason}`).join("; "),
		};
	}
	return { stopReason: "coverage-gap", reason: "no runnable mapped Task" };
}

function notRunEntries({ analysis, tasks, state, attemptedTasks, now }) {
	const byId = new Map(tasks.map((task) => [task.id, task]));
	const completed = new Set(completedTasks(tasks));
	const leases = activeLeases(state, now);
	const entries = [];
	for (const id of mappedTaskIds(analysis)) {
		if (attemptedTasks.has(id)) continue;
		const task = byId.get(id);
		if (!task) {
			entries.push({ task: id, reason: "task-not-found" });
			continue;
		}
		if (engineeringComplete(task)) continue;
		let reason;
		if (task.status !== "ready") {
			reason = `status:${task.status || "unknown"}`;
		} else {
			const pending = task.dependsOn.filter((dependency) => !completed.has(dependency));
			if (pending.length) reason = `dependency-waiting:${pending.join(",")}`;
			else if (leases.some((lease) => lease.task === id)) reason = "already-leased";
			else if (leases.some((lease) => leaseConflicts(task, lease))) reason = "scope-conflict";
			else reason = "not-selected";
		}
		entries.push({ task: id, reason: truncate(reason, NOT_RUN_LIMIT) });
	}
	return entries;
}

function buildReport({
	runId,
	requirement,
	plan,
	startedAt,
	stopReason,
	reason,
	analysis,
	attempted,
	notRun,
	reportPath,
}) {
	const now = Date.now();
	const report = {
		version: 1,
		runId,
		requirement,
		plan,
		generatedAt: now,
		startedAt,
		finishedAt: now,
		stopReason,
		reason: reason ? truncate(reason, REASON_LIMIT) : null,
		clauses: analysis.clauses.map(({ id, text, status, acceptance, tasks, missingEvidence }) => ({
			id,
			text,
			status,
			acceptance,
			tasks,
			missingEvidence,
		})),
		tasks: analysis.tasks,
		unmappedTasks: analysis.unmappedTasks,
		humanAcceptance: analysis.acceptance,
		release: "not-authorized",
		evidenceCheck: "presence-only",
		semanticReview: "not-performed",
		attempted,
		notRun,
	};
	if (reportPath) report.reportPath = reportPath;
	return validateRequirementReport(report);
}

function writeReport(path, report) {
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	const temporary = `${path}.${randomUUID()}.tmp`;
	writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx", mode: 0o600 });
	try {
		renameSync(temporary, path);
	} catch (error) {
		try {
			unlinkSync(temporary);
		} catch {
			/* The original rename error is the useful one. */
		}
		throw error;
	}
	return path;
}

/**
 * Execute only ready Tasks named by the manifest, serially, by delegating to `cycle`.
 * The runner is a selection/reporting layer: leases, run records, implementation, review,
 * verification and optional integration remain owned by `cycle` and the controller store.
 */
export async function requirementRun({
	root,
	store,
	policy,
	settings,
	requirement,
	plan,
	coverage,
	holder,
	runPrefix,
	reportPath,
	limit = 10,
	maxStalls = 2,
	tests = [],
	signal,
	through = "verify",
	execute = cycle,
}) {
	const limits = loopLimits(limit, maxStalls);
	if (!/^REQ-[0-9]{4}$/u.test(requirement ?? "")) throw new Error("invalid requirement id");
	if (!/^PLAN-[0-9]{4}$/u.test(plan ?? "")) throw new Error("invalid plan id");
	if (!/^[A-Za-z0-9:_@.-]{1,120}$/u.test(holder ?? "")) throw new Error("invalid requirement run holder");
	const prefix = runPrefix ?? requirementRunPrefix(store);
	if (!/^[A-Za-z0-9:_@.-]{1,96}$/u.test(prefix)) throw new Error("invalid requirement run prefix");
	if (!["verify", "integrate"].includes(through)) throw new Error("invalid requirement run target");

	const startedAt = Date.now();
	const runId = prefix;
	const loaded = loadTasks(root);
	let analysis = loaded.problems.length
		? {
				problems: loaded.problems,
				warnings: [],
				clauses: [],
				tasks: [],
				unmappedTasks: [],
				complete: false,
				acceptance: "not-applicable",
			}
		: validateCoverage({ root, requirement, plan, coverage, tasks: loaded.tasks });
	let tasks = loaded.tasks;
	let state = store.read();
	const attempted = [];
	const attemptedTasks = new Set();
	const verifiedAwaitingIntegration = new Set();
	let stopReason = "limit";
	let reason = null;
	let stalls = 0;

	const finish = (nextReason, detail = null) => {
		stopReason = nextReason;
		reason = detail;
	};

	if (loaded.problems.length) {
		finish("failed", loaded.problems.join("; "));
	} else if (signal?.aborted) {
		finish("cancelled", "interrupted before start");
	} else if (policy.paused || state.control.paused) {
		finish("paused", "controller or policy is paused");
	} else {
		const capability = capabilityStop(policy, through);
		if (capability) {
			finish(capability.stopReason, capability.reason);
		} else if (analysis.problems.length) {
			finish("coverage-gap", analysis.problems.join("; "));
		} else if (analysis.complete) {
			finish("engineering-complete");
		} else {
			for (let index = 0; index < limits.limit; index += 1) {
				if (signal?.aborted) {
					finish("cancelled", "interrupted");
					break;
				}
				state = store.read();
				if (state.control.paused || policy.paused) {
					finish("paused", "controller or policy is paused");
					break;
				}
				const current = loadTasks(root);
				if (current.problems.length) {
					finish("failed", current.problems.join("; "));
					break;
				}
				tasks = current.tasks;
				analysis = validateCoverage({ root, requirement, plan, coverage, tasks });
				if (analysis.problems.length) {
					finish("coverage-gap", analysis.problems.join("; "));
					break;
				}
				if (analysis.complete) {
					finish("engineering-complete");
					break;
				}
				const selection = evaluateMappedTasks({
					analysis,
					tasks,
					state,
					attemptedTasks,
					now: Date.now(),
				});
				if (!selection.candidate) {
					const diagnosis = diagnoseNoCandidate(selection, {
						byId: new Map(tasks.map((task) => [task.id, task])),
						verifiedAwaitingIntegration,
					});
					finish(diagnosis.stopReason, diagnosis.reason);
					break;
				}
				const attemptRunId = `${prefix}-${index + 1}`;
				let result;
				try {
					result = await execute({
						root,
						store,
						policy,
						settings,
						taskId: selection.candidate.id,
						runId: attemptRunId,
						holder,
						tests,
						signal,
						through,
					});
				} catch (error) {
					result = { runId: attemptRunId, status: "needs-action", reason: error.message };
				}
				const after = store.read();
				const run = after.runs[attemptRunId];
				const attempt = {
					task: selection.candidate.id,
					runId: attemptRunId,
					status: result?.status ?? "needs-action",
					reason: result?.reason ? truncate(result.reason, REASON_LIMIT) : null,
					stage: run?.status ?? null,
					cleanupUnknown: run?.cleanupUnknown ?? false,
				};
				attempted.push(attempt);
				attemptedTasks.add(selection.candidate.id);
				if (attempt.status === "verified" && through === "verify") {
					verifiedAwaitingIntegration.add(selection.candidate.id);
				}
				if (signal?.aborted) {
					finish("cancelled", "interrupted after an attempt");
					break;
				}
				if (attempt.cleanupUnknown) {
					finish("needs-human", `cleanup unconfirmed for ${attempt.task}; recover before continuing`);
					break;
				}
				if (after.control.paused) {
					finish("paused", "controller paused during an attempt");
					break;
				}
				if (attempt.status === "needs-action") {
					stalls += 1;
					if (stalls >= limits.maxStalls) {
						finish("stalled", attempt.reason ?? "repeated needs-action");
						break;
					}
				} else {
					stalls = 0;
				}
				if (["failed", "integration-failed"].includes(attempt.status)) {
					finish("failed", attempt.reason ?? attempt.status);
					break;
				}
				if (index === limits.limit - 1) {
					finish("limit", `reached limit ${limits.limit}`);
					break;
				}
			}
		}
	}

	const finalLoaded = loadTasks(root);
	if (!finalLoaded.problems.length) {
		tasks = finalLoaded.tasks;
		const finalAnalysis = validateCoverage({ root, requirement, plan, coverage, tasks });
		if (finalAnalysis.problems.length === 0) {
			analysis = finalAnalysis;
		} else if (!["failed", "cancelled"].includes(stopReason)) {
			analysis = finalAnalysis;
			finish("coverage-gap", finalAnalysis.problems.join("; "));
		}
	}
	if (
		analysis.complete &&
		!["cancelled", "failed"].includes(stopReason) &&
		!attempted.some((entry) => entry.cleanupUnknown)
	) {
		finish("engineering-complete");
	}

	state = store.read();
	const target = reportPath
		? resolve(reportPath)
		: join(store.root, "requirement-runs", `${runId.replace(/[^A-Za-z0-9._-]/gu, "-")}.json`);
	const report = buildReport({
		runId,
		requirement,
		plan,
		startedAt,
		stopReason,
		reason,
		analysis,
		attempted,
		notRun: notRunEntries({ analysis, tasks, state, attemptedTasks, now: Date.now() }),
		reportPath: target,
	});
	writeReport(target, report);
	return report;
}
