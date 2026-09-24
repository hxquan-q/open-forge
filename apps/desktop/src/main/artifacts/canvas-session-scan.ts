// Copyright The Open Forge contributors.
import type { ArtifactDescriptor } from "@vetta/runtime-core/task";
import { projectRuntimeSessionTaskState } from "@vetta/runtime-core/task";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function extractArtifactFact(record: unknown): unknown {
	if (!isRecord(record)) return undefined;
	if (record.type === "artifact.descriptor.recorded") return record;
	if (isRecord(record.event) && record.event.type === "artifact.descriptor.recorded") return record.event;
	return undefined;
}

/** 从 Conversation JSONL 文本投影 artifact 最新 descriptor；坏行跳过。 */
export function projectArtifactsFromConversationText(text: string): readonly ArtifactDescriptor[] {
	const facts: unknown[] = [];
	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		try {
			const fact = extractArtifactFact(JSON.parse(line));
			if (fact) facts.push(fact);
		} catch {
			// 单行损坏不阻断其余事实投影。
		}
	}
	return projectRuntimeSessionTaskState(facts).artifacts;
}

export function readSessionIdFromConversationText(text: string): string | undefined {
	const first = text.split("\n").find((line) => line.trim());
	if (!first) return undefined;
	try {
		const parsed: unknown = JSON.parse(first);
		if (isRecord(parsed) && typeof parsed.sessionId === "string") return parsed.sessionId;
	} catch {
		return undefined;
	}
	return undefined;
}
