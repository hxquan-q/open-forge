// Copyright The Open Forge contributors.
import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import { createArtifactTool } from "../../../src/features/artifacts/artifact-tool.js";
import {
	ARTIFACT_TOOL_DESCRIPTION,
	ARTIFACT_TOOL_NAME,
	ArtifactToolErrorSchema,
	type ArtifactToolInput,
	ArtifactToolInputSchema,
	artifactToolError,
	formatArtifactToolResult,
	readArtifactToolInput,
} from "../../../src/features/artifacts/artifact-tool-contract.js";

const validCreate: ArtifactToolInput = {
	action: "create",
	title: "Notes",
	kind: "document",
	content: "# Hello",
	contentType: "text/markdown",
};

describe("artifact tool input schema", () => {
	it("接受 create / update / get / list / attach_to_task 的合法载荷", () => {
		expect(readArtifactToolInput(validCreate)).toEqual(validCreate);
		expect(
			readArtifactToolInput({
				action: "update",
				artifactId: "art-1",
				baseVersion: 2,
				content: "next",
			}),
		).toMatchObject({ action: "update", artifactId: "art-1", baseVersion: 2 });
		expect(readArtifactToolInput({ action: "get", artifactId: "art-1" })).toMatchObject({ action: "get" });
		expect(readArtifactToolInput({ action: "list" })).toMatchObject({ action: "list" });
		expect(readArtifactToolInput({ action: "attach_to_task", artifactId: "art-1" })).toMatchObject({
			action: "attach_to_task",
		});
	});

	it("拒绝缺少 baseVersion 的 update、未知 action 和多余字段", () => {
		expect(readArtifactToolInput({ action: "update", artifactId: "art-1", content: "x" })).toBeUndefined();
		expect(readArtifactToolInput({ action: "delete", artifactId: "art-1" })).toBeUndefined();
		expect(Value.Check(ArtifactToolInputSchema, { ...validCreate, extra: true })).toBe(false);
		expect(
			Value.Check(ArtifactToolInputSchema, { action: "update", artifactId: "art-1", baseVersion: 0, content: "x" }),
		).toBe(false);
	});
});

describe("artifact tool error shape", () => {
	it("接受冻结的错误码并拒绝未知 code", () => {
		const stale = artifactToolError("stale_version", "behind", {
			action: "update",
			artifactId: "art-1",
			baseVersion: 1,
			currentVersion: 3,
		});
		expect(Value.Check(ArtifactToolErrorSchema, stale)).toBe(true);
		expect(
			Value.Check(ArtifactToolErrorSchema, artifactToolError("missing_file", "gone", { artifactId: "art-1" })),
		).toBe(true);
		expect(Value.Check(ArtifactToolErrorSchema, artifactToolError("no_active_task", "no task"))).toBe(true);
		expect(
			Value.Check(ArtifactToolErrorSchema, {
				ok: false,
				code: "not_found",
				message: "no",
			}),
		).toBe(false);
	});
});

describe("artifact tool adapter", () => {
	it("把宿主成功结果放进 content，结构化合同放进 details", async () => {
		const tool = createArtifactTool({
			invoke: async () => ({
				ok: true,
				action: "create",
				artifactId: "art-1",
				version: 1,
				title: "Notes",
				kind: "document",
			}),
		});
		expect(tool.name).toBe(ARTIFACT_TOOL_NAME);
		const result = await tool.execute({
			sessionId: "s1",
			turnId: "t1",
			toolCallId: "c1",
			input: validCreate,
			signal: new AbortController().signal,
		});
		expect(result.isError).toBeFalsy();
		expect(result.content[0]).toMatchObject({ type: "text" });
		expect(result.details).toMatchObject({ ok: true, artifactId: "art-1", version: 1 });
		expect(String(result.content[0] && "text" in result.content[0] ? result.content[0].text : "")).toContain(
			"Canvas activity tab",
		);
		expect(ARTIFACT_TOOL_DESCRIPTION).toMatch(/MUST call create/);
	});

	it("宿主不可用时返回 unimplemented，不假装写入成功", async () => {
		const tool = createArtifactTool({ invoke: async () => undefined });
		const result = await tool.execute({
			sessionId: "s1",
			turnId: "t1",
			toolCallId: "c1",
			input: validCreate,
			signal: new AbortController().signal,
		});
		expect(result.isError).toBe(true);
		expect(result.details).toMatchObject({ ok: false, code: "unimplemented" });
	});

	it("stale_version 进入 details 且 isError", () => {
		const result = formatArtifactToolResult(
			artifactToolError("stale_version", "behind", {
				action: "update",
				artifactId: "art-1",
				currentVersion: 4,
			}),
		);
		expect(result.isError).toBe(true);
		expect(result.details).toMatchObject({ code: "stale_version", currentVersion: 4 });
	});
});
