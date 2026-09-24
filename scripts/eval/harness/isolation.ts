import { ROUTING_EVAL_TOOL_NAMES } from "./fake-tools.js";

export interface EvalIsolationSnapshot {
	readonly skillNames: readonly string[];
	readonly activeToolNames: readonly string[];
}

export const EMPTY_ISOLATION: EvalIsolationSnapshot = {
	skillNames: [],
	activeToolNames: [],
};

export function readIsolationSnapshot(session: {
	getSkills(): readonly { readonly name: string }[];
	getActiveToolNames(): readonly string[];
}): EvalIsolationSnapshot {
	return {
		skillNames: session.getSkills().map((skill) => skill.name),
		activeToolNames: [...session.getActiveToolNames()],
	};
}

/** Isolation contract: no host skills, and only the fake eval catalog is active. */
export function isolationViolations(snapshot: EvalIsolationSnapshot): string[] {
	const violations: string[] = [];
	if (snapshot.skillNames.length > 0) {
		violations.push(`loaded leaked skills: ${snapshot.skillNames.join(", ")}`);
	}
	const expected = new Set<string>(ROUTING_EVAL_TOOL_NAMES);
	const unexpected = snapshot.activeToolNames.filter((name) => !expected.has(name));
	if (unexpected.length > 0) {
		violations.push(`unexpected active tools: ${unexpected.join(", ")}`);
	}
	const missing = ROUTING_EVAL_TOOL_NAMES.filter((name) => !snapshot.activeToolNames.includes(name));
	if (missing.length > 0) {
		violations.push(`missing routing tools: ${missing.join(", ")}`);
	}
	return violations;
}
