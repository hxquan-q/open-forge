// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { createBrowserTabTool } from "../../../src/features/browser-tab/browser-tab-tool.js";
import {
	BROWSER_TAB_TOOL_DESCRIPTION,
	localPathToBrowserFileUrl,
	readBrowserTabToolInput,
} from "../../../src/features/browser-tab/browser-tab-tool-contract.js";

const paths = [
	["D:\\demo\\index.html", "file:///D:/demo/index.html"],
	["D:/我的 站点/a#b?.html", "file:///D:/%E6%88%91%E7%9A%84%20%E7%AB%99%E7%82%B9/a%23b%3F.html"],
	["/home/demo/100%.html", "file:///home/demo/100%25.html"],
	["\\\\server\\share\\index.html", "file://server/share/index.html"],
	["file:///D:/demo/a%20b.html", "file:///D:/demo/a%20b.html"],
	["https://example.com/a?x=1#b", "https://example.com/a?x=1#b"],
] as const;

describe("browser_tab local file navigation", () => {
	it.each(paths)("规范化 %s 且重入幂等", (input, expected) => {
		expect(localPathToBrowserFileUrl(input)).toBe(expected);
		expect(localPathToBrowserFileUrl(expected)).toBe(expected);
		expect(readBrowserTabToolInput({ action: "navigate", url: input })).toEqual({
			action: "navigate",
			url: expected,
		});
	});

	it("从工具校验到执行保持规范化 file URL，不要求模型先启动服务器", async () => {
		const received: unknown[] = [];
		const tool = createBrowserTabTool({
			invoke: async (request) => {
				received.push(request.input);
				return { ok: true, action: "navigate", pageUrl: "file:///D:/demo/index.html", pageRevision: 1 };
			},
		});
		const raw = { action: "navigate" as const, url: "D:\\demo\\index.html" };
		expect(tool.validateInput?.(raw)).toEqual({ action: "navigate", url: "file:///D:/demo/index.html" });
		const result = await tool.execute({
			input: raw,
			sessionId: "s",
			turnId: "t",
			toolCallId: "c",
			signal: new AbortController().signal,
		});
		expect(result.isError).toBeUndefined();
		expect(received).toEqual([{ action: "navigate", url: "file:///D:/demo/index.html" }]);
		expect(BROWSER_TAB_TOOL_DESCRIPTION).toContain("no static server needed");
	});

	it("仍拒绝空参数、未知字段、脚本协议与相对路径", () => {
		for (const input of [
			{},
			{ action: "navigate", url: "index.html" },
			{ action: "navigate", url: "javascript:alert(1)" },
			{ action: "navigate", url: "/demo/a.html", script: "bad" },
		]) {
			expect(readBrowserTabToolInput(input)).toBeUndefined();
		}
	});
});
