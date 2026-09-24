// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { projectArtifactsFromConversationText, readSessionIdFromConversationText } from "./canvas-session-scan.js";

describe("canvas session scan", () => {
	it("从 JSONL 投影最新 descriptor，并跳过坏行", () => {
		const text = [
			JSON.stringify({ type: "session", sessionId: "session-1", cwd: "C:/proj" }),
			"not-json",
			JSON.stringify({
				type: "artifact.descriptor.recorded",
				sessionId: "session-1",
				timestamp: 1,
				artifact: {
					schemaVersion: 1,
					artifactId: "artifact-1",
					kind: "document",
					status: "generated",
					title: "Notes",
					uri: "file:///tmp/v1.md",
					version: 1,
					sourceSessionId: "session-1",
					createdAt: 1,
					updatedAt: 1,
				},
			}),
			JSON.stringify({
				type: "artifact.descriptor.recorded",
				sessionId: "session-1",
				timestamp: 2,
				artifact: {
					schemaVersion: 1,
					artifactId: "artifact-1",
					kind: "document",
					status: "generated",
					title: "Notes v2",
					uri: "file:///tmp/v2.md",
					version: 2,
					sourceSessionId: "session-1",
					createdAt: 1,
					updatedAt: 2,
				},
			}),
		].join("\n");
		expect(readSessionIdFromConversationText(text)).toBe("session-1");
		expect(projectArtifactsFromConversationText(text)).toEqual([
			expect.objectContaining({ artifactId: "artifact-1", version: 2, title: "Notes v2" }),
		]);
	});
});
