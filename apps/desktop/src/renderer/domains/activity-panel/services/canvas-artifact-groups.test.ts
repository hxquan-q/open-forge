// Copyright The Open Forge contributors.
import type { DesktopCanvasArtifactView } from "@preload/api-types/canvas";
import type { ArtifactDescriptor } from "@vetta/runtime-core/task";
import { describe, expect, it } from "vitest";
import { groupCanvasArtifactsBySession, resolveCanvasSessionTitle } from "./canvas-artifact-groups";

function view(
	artifactId: string,
	sessionId: string,
	updatedAt: number,
	flags: { missing?: boolean; externalUpdate?: boolean } = {},
): DesktopCanvasArtifactView {
	const descriptor: ArtifactDescriptor = {
		schemaVersion: 1,
		artifactId,
		kind: "document",
		status: "generated",
		title: artifactId,
		version: 1,
		sourceSessionId: sessionId,
		createdAt: updatedAt,
		updatedAt,
	};
	return {
		descriptor,
		missing: flags.missing === true,
		externalUpdate: flags.externalUpdate === true,
	};
}

describe("groupCanvasArtifactsBySession", () => {
	it("按来源会话分组，组内与组间都按更新时间倒序", () => {
		const grouped = groupCanvasArtifactsBySession([
			view("old", "session-a", 10),
			view("newer-b", "session-b", 40),
			view("newer-a", "session-a", 30, { missing: true }),
			view("mid-b", "session-b", 20, { externalUpdate: true }),
		]);
		expect(grouped.map((group) => group.sessionId)).toEqual(["session-b", "session-a"]);
		expect(grouped[0]?.items.map((item) => item.descriptor.artifactId)).toEqual(["newer-b", "mid-b"]);
		expect(grouped[1]?.items.map((item) => item.descriptor.artifactId)).toEqual(["newer-a", "old"]);
		expect(grouped[1]?.items[0]?.missing).toBe(true);
		expect(grouped[0]?.items[1]?.externalUpdate).toBe(true);
	});
});

describe("resolveCanvasSessionTitle", () => {
	it("有标题用标题，否则回落到未命名会话", () => {
		expect(resolveCanvasSessionTitle("s1", new Map([["s1", "整理材料"]]), "未命名会话")).toBe("整理材料");
		expect(resolveCanvasSessionTitle("s2", new Map([["s1", "整理材料"]]), "未命名会话")).toBe("未命名会话");
	});
});
