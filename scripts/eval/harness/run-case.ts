import { loadToolRoutingGoldens, type ToolRoutingGolden } from "./goldens.js";
import { isolationViolations } from "./isolation.js";
import { firstToolViolates } from "./project-trace.js";
import { type IsolatedSessionRun, runIsolatedRoutingPrompt } from "./run-session.js";

export interface RoutingCaseResult {
	readonly id: string | null;
	readonly input: string;
	readonly actualOutput: string;
	readonly firstToolName: string | null;
	readonly toolsCalled: readonly string[];
	readonly skillNames: readonly string[];
	readonly activeToolNames: readonly string[];
	readonly isolationViolations: readonly string[];
	readonly expectedFirstTool: string | null;
	readonly forbiddenTools: readonly string[];
	readonly firstToolViolations: readonly string[];
	readonly errorMessage: string | null;
}

export function parseRunCaseArgs(argv: readonly string[]): { id?: string; input?: string } {
	let id: string | undefined;
	let input: string | undefined;
	for (let index = 0; index < argv.length; index += 1) {
		const current = argv[index];
		const next = argv[index + 1];
		if (current === "--id" && next) {
			id = next;
			index += 1;
			continue;
		}
		if (current === "--input" && next) {
			input = next;
			index += 1;
		}
	}
	return { id, input };
}

export function serializeRoutingCase(run: IsolatedSessionRun, golden?: ToolRoutingGolden): RoutingCaseResult {
	const leaked = isolationViolations(run.isolation);
	const expectedFirstTool = golden?.expectedFirstTool ?? null;
	const forbiddenTools = golden?.forbiddenTools ?? [];
	const routingViolations =
		expectedFirstTool === null ? [] : firstToolViolates(run.trace, expectedFirstTool, forbiddenTools);
	return {
		id: golden?.id ?? null,
		input: run.trace.input,
		actualOutput: run.trace.actualOutput,
		firstToolName: run.trace.firstToolName ?? null,
		toolsCalled: run.trace.toolsCalled.map((call) => call.name),
		skillNames: run.isolation.skillNames,
		activeToolNames: run.isolation.activeToolNames,
		isolationViolations: leaked,
		expectedFirstTool,
		forbiddenTools,
		firstToolViolations: routingViolations,
		errorMessage: run.errorMessage ?? null,
	};
}

export async function executeRoutingCase(args: { id?: string; input?: string }): Promise<RoutingCaseResult> {
	const goldens = loadToolRoutingGoldens();
	const golden = args.id ? goldens.find((entry) => entry.id === args.id) : undefined;
	if (args.id && !golden) {
		throw new Error(`unknown golden id: ${args.id}`);
	}
	const input = args.input ?? golden?.input;
	if (!input) {
		throw new Error("run-case needs --id or --input");
	}
	const run = await runIsolatedRoutingPrompt(input);
	return serializeRoutingCase(run, golden);
}

async function main(): Promise<void> {
	const originalLog = console.log;
	console.log = (...args: unknown[]) => {
		console.error(...args);
	};
	try {
		const result = await executeRoutingCase(parseRunCaseArgs(process.argv.slice(2)));
		process.stdout.write(`${JSON.stringify(result)}\n`);
	} finally {
		console.log = originalLog;
	}
}

if (import.meta.main) {
	main().catch((error) => {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`${message}\n`);
		process.exit(1);
	});
}
