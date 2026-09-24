export interface ProjectedToolCall {
	readonly name: string;
	readonly input: Record<string, unknown>;
	readonly isError: boolean;
}

export interface SessionTraceEvent {
	readonly type: string;
	readonly toolName?: string;
	readonly args?: unknown;
	readonly isError?: boolean;
}

export interface ProjectedSessionTrace {
	readonly input: string;
	readonly actualOutput: string;
	readonly toolsCalled: readonly ProjectedToolCall[];
	readonly firstToolName: string | undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value as Record<string, unknown>;
}

export function projectSessionTrace(
	input: string,
	actualOutput: string,
	events: readonly SessionTraceEvent[],
): ProjectedSessionTrace {
	const toolsCalled: ProjectedToolCall[] = [];
	for (const event of events) {
		if (event.type !== "tool_execution_end" || typeof event.toolName !== "string") continue;
		toolsCalled.push({
			name: event.toolName,
			input: asRecord(event.args),
			isError: event.isError === true,
		});
	}
	return {
		input,
		actualOutput,
		toolsCalled,
		firstToolName: toolsCalled[0]?.name,
	};
}

export function firstToolViolates(
	trace: ProjectedSessionTrace,
	expectedFirstTool: string,
	forbiddenTools: readonly string[],
): string[] {
	const violations: string[] = [];
	if (expectedFirstTool === "") {
		if (trace.firstToolName !== undefined) {
			violations.push(`first tool was ${trace.firstToolName}, expected (none)`);
		}
	} else if (trace.firstToolName !== expectedFirstTool) {
		violations.push(`first tool was ${trace.firstToolName ?? "(none)"}, expected ${expectedFirstTool}`);
	}
	for (const name of forbiddenTools) {
		if (trace.toolsCalled.some((call) => call.name === name)) {
			violations.push(`called forbidden tool ${name}`);
		}
	}
	return violations;
}
