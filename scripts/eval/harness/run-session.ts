import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCodingAgentSession } from "@vetta/coding-agent/sdk";
import { createSubjectModel } from "./deepseek-model.js";
import { createRoutingEvalTools, ROUTING_EVAL_SYSTEM_PROMPT, ROUTING_EVAL_TOOL_NAMES } from "./fake-tools.js";
import {
	EMPTY_ISOLATION,
	type EvalIsolationSnapshot,
	isolationViolations,
	readIsolationSnapshot,
} from "./isolation.js";
import { type ProjectedSessionTrace, projectSessionTrace, type SessionTraceEvent } from "./project-trace.js";

export interface IsolatedSessionRun {
	readonly trace: ProjectedSessionTrace;
	readonly isolation: EvalIsolationSnapshot;
	readonly errorMessage: string | undefined;
}

async function writeWebsiteFixture(workspace: string): Promise<void> {
	await writeFile(
		join(workspace, "package.json"),
		`${JSON.stringify({ name: "eval-website", private: true }, null, 2)}\n`,
	);
	await writeFile(join(workspace, "index.html"), "<!doctype html><html><body><h1>Eval site</h1></body></html>\n");
	await mkdir(join(workspace, "remotion"), { recursive: true });
	await writeFile(
		join(workspace, "remotion", "package.json"),
		`${JSON.stringify({ name: "eval-remotion", dependencies: { remotion: "4.0.0" } }, null, 2)}\n`,
	);
}

function restoreEnv(name: string, previous: string | undefined): void {
	if (previous === undefined) {
		delete process.env[name];
		return;
	}
	process.env[name] = previous;
}

export async function runIsolatedRoutingPrompt(input: string): Promise<IsolatedSessionRun> {
	const root = await mkdtemp(join(tmpdir(), "openforge-eval-"));
	const workspace = join(root, "website");
	const agentDir = join(root, "agent");
	const vettaHome = join(root, "vetta-home");
	await mkdir(workspace, { recursive: true });
	await mkdir(agentDir, { recursive: true });
	await mkdir(vettaHome, { recursive: true });
	// collectAncestorAgentSkillEntries walks cwd → parents until .git. Temp dirs sit
	// under the user profile on Windows, so without a workspace .git it loads ~/.agents.
	await mkdir(join(workspace, ".git"), { recursive: true });
	await writeWebsiteFixture(workspace);

	const previousVettaHome = process.env.VETTA_HOME;
	process.env.VETTA_HOME = vettaHome;

	const events: SessionTraceEvent[] = [];
	const startedArgs = new Map<string, unknown>();
	let errorMessage: string | undefined;
	let actualOutput = "";
	let isolation: EvalIsolationSnapshot = EMPTY_ISOLATION;

	try {
		const { session } = await createCodingAgentSession({
			cwd: workspace,
			agentDir,
			storage: { kind: "memory" },
			model: createSubjectModel(),
			thinkingLevel: "off",
			customTools: createRoutingEvalTools(),
			includeAgentSkills: false,
			enableMcp: false,
			enableSubagents: false,
			enableBackgroundTasks: false,
			appendSystemPrompt: ROUTING_EVAL_SYSTEM_PROMPT,
		});
		// create-time activeTools only accepts built-in names and an empty list
		// also hides custom tools. Pin the fake routing surface after create.
		session.setActiveToolsByName([...ROUTING_EVAL_TOOL_NAMES]);
		isolation = readIsolationSnapshot(session);
		const leaked = isolationViolations(isolation);
		if (leaked.length > 0) {
			errorMessage = leaked.join("; ");
			await session.close();
		} else {
			const unsubscribe = session.subscribe((event) => {
				if (event.type === "tool_execution_start") {
					startedArgs.set(event.toolCallId, event.args);
					events.push({ type: event.type, toolName: event.toolName, args: event.args });
					return;
				}
				if (event.type === "tool_execution_end") {
					events.push({
						type: event.type,
						toolName: event.toolName,
						args: startedArgs.get(event.toolCallId),
						isError: event.isError,
					});
				}
			});

			try {
				await session.prompt(input);
				actualOutput = session.getLastAssistantText() ?? "";
			} catch (error) {
				errorMessage = error instanceof Error ? error.message : String(error);
				actualOutput = session.getLastAssistantText() ?? "";
			} finally {
				unsubscribe();
				await session.close();
			}
		}
	} catch (error) {
		errorMessage ??= error instanceof Error ? error.message : String(error);
	} finally {
		restoreEnv("VETTA_HOME", previousVettaHome);
		await rm(root, { recursive: true, force: true });
	}

	return {
		trace: projectSessionTrace(input, actualOutput, events),
		isolation,
		errorMessage,
	};
}
