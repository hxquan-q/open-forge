// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { extractToolUiDetails } from "./chat-service";

describe("artifact tool details", () => {
	it("create 成功结果提供在画布中打开所需的 artifactId", () => {
		expect(
			extractToolUiDetails(undefined, {
				ok: true,
				action: "create",
				artifactId: "art-1",
				title: "架构报告",
				version: 1,
			}),
		).toEqual({
			artifact: { artifactId: "art-1", title: "架构报告", action: "create", version: 1 },
		});
	});

	it("list 或失败结果不生成打开入口", () => {
		expect(extractToolUiDetails(undefined, { ok: true, action: "list", items: [] })).toBeUndefined();
		expect(extractToolUiDetails(undefined, { ok: false, action: "create", artifactId: "art-1" })).toBeUndefined();
	});
});
