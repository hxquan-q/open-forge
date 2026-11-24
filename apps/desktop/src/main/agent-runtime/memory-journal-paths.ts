// Copyright The Open Forge contributors.
import { join } from "node:path";
import type {
	CodingAgentMemoryRuntimeFactoryOptions,
	CodingAgentRuntimeSessionOptions,
} from "@vetta/coding-agent/composition";

export interface DesktopMemoryJournalPaths {
	readonly memoryFile: string;
	readonly journalFile: string;
}

export function resolveDesktopMemoryJournalPaths(
	options: CodingAgentMemoryRuntimeFactoryOptions,
	sessionOptions: CodingAgentRuntimeSessionOptions,
): DesktopMemoryJournalPaths {
	const root =
		sessionOptions.agentMode === "coding" && sessionOptions.projectAiWorkspaceRoot
			? sessionOptions.projectAiWorkspaceRoot
			: options.cwd;
	return {
		memoryFile: options.memoryFile ?? join(root, "MEMORY.md"),
		journalFile: join(root, "JOURNAL.md"),
	};
}
