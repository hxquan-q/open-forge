#!/usr/bin/env node
// Copyright The Open Forge contributors.
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contract } from "./contracts.mjs";
import { exportEvidence } from "./evidence.mjs";
import { claim, release } from "./leases.mjs";
import { executeAdapter } from "./runner.mjs";
import { createStore } from "./store.mjs";
import { configuration, makeRunContract, taskById } from "./tasks.mjs";
import { verifyRun } from "./verify.mjs";

const COMMANDS = new Set([
	"doctor",
	"plan",
	"claim",
	"run",
	"verify",
	"status",
	"release",
	"recover",
	"pause",
	"resume",
	"evidence",
]);
const OPTIONS = new Set([
	"--repo",
	"--state-dir",
	"--task",
	"--worktree",
	"--contract",
	"--run-id",
	"--holder",
	"--adapter",
	"--role",
	"--test",
]);

function argumentsOf(args) {
	const [command, ...rest] = args;
	if (!COMMANDS.has(command)) throw new Error(`expected command: ${[...COMMANDS].join(" | ")}`);
	const options = {};
	for (let index = 0; index < rest.length; index += 2) {
		const key = rest[index];
		const value = rest[index + 1];
		if (!OPTIONS.has(key) || !value || value.startsWith("--")) throw new Error(`invalid option: ${key}`);
		if (key === "--test") {
			options.tests ??= [];
			options.tests.push(value);
		} else if (Object.hasOwn(options, key)) throw new Error(`duplicate option: ${key}`);
		else options[key] = value;
	}
	return { command, options };
}

function required(options, key) {
	if (!options[key]) throw new Error(`required option: ${key}`);
	return options[key];
}

function runToken(store, runId) {
	const lease = Object.values(store.read().leases).find((entry) => entry.runId === runId && entry.status === "active");
	if (!lease) throw new Error("run has no active lease");
	return { task: lease.task, runId, holder: lease.holder, generation: lease.generation };
}

export async function main(args) {
	const { command, options } = argumentsOf(args);
	const root = resolve(options["--repo"] ?? process.cwd());
	const config = configuration(root);
	if (command === "doctor") {
		return {
			contractValid: true,
			targetLevel: config.policy.targetLevel,
			level: config.policy.level,
			paused: config.policy.paused,
			readyForModelExecution:
				config.policy.level > 0 &&
				!config.policy.paused &&
				config.settings.adapters.some(
					(adapter) =>
						adapter.enabled &&
						adapter.isolation !== "none" &&
						config.policy.allowedProviders.includes(adapter.provider) &&
						isAbsolute(adapter.command[0]) &&
						existsSync(adapter.command[0]),
				),
			adapters: config.settings.adapters.map((adapter) => ({
				id: adapter.id,
				enabled: adapter.enabled,
				family: adapter.family,
				model: adapter.model,
				isolation: adapter.isolation,
			})),
			note: "Configuration validation does not prove sandbox isolation, real model quality, CI, or release readiness.",
		};
	}
	if (command === "plan") {
		const task = taskById(root, required(options, "--task"));
		return makeRunContract(task, config, resolve(required(options, "--worktree")), options.tests ?? []);
	}
	const directory = resolve(required(options, "--state-dir"));
	if (command === "status" && !existsSync(directory))
		return { initialized: false, runs: [], paused: config.policy.paused };
	const store = createStore(directory);
	if (command === "status") {
		const state = store.read();
		return {
			initialized: true,
			revision: state.revision,
			paused: state.control.paused || config.policy.paused,
			runs: Object.entries(state.runs).map(([runId, run]) => ({
				runId,
				task: run.task,
				status: run.status,
				attempts: run.attempts.length,
				binding: run.binding ?? null,
			})),
			leases: Object.values(state.leases).map((lease) => ({
				task: lease.task,
				runId: lease.runId,
				generation: lease.generation,
				status: lease.status,
				expiresAt: lease.expiresAt,
			})),
		};
	}
	if (["pause", "resume"].includes(command)) {
		store.transaction((state) => {
			state.control.paused = command === "pause";
			state.audit.push({ event: command, at: Date.now() });
		});
		return { paused: command === "pause" };
	}
	if (command === "recover") return { recovered: store.recover() };
	if (command === "evidence") return exportEvidence(store, required(options, "--run-id"), config.policy);
	if (command === "claim") {
		const task = taskById(root, required(options, "--task"));
		return claim(store, task, {
			holder: required(options, "--holder"),
			runId: required(options, "--run-id"),
			ttl: config.policy.limits.leaseMs,
		});
	}
	const token = runToken(store, required(options, "--run-id"));
	if (command === "release") {
		release(store, token);
		return { released: token.runId };
	}
	if (command === "verify") return verifyRun({ store, policy: config.policy, token });
	const runContract = contract("run-contract", JSON.parse(readFileSync(required(options, "--contract"), "utf8")));
	const task = taskById(root, token.task);
	const result = await executeAdapter({
		store,
		...config,
		token,
		task,
		runContract,
		adapterId: required(options, "--adapter"),
		role: required(options, "--role"),
		request: readFileSync(join(root, task.file), "utf8"),
	});
	return {
		runId: token.runId,
		task: task.id,
		status: result.status,
		binding: result.binding,
		attempts: result.attempts.length,
	};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		console.log(JSON.stringify(await main(process.argv.slice(2)), null, 2));
	} catch (error) {
		console.error(JSON.stringify({ error: error.message }));
		process.exitCode = 1;
	}
}
