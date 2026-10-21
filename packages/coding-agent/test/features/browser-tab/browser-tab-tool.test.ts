// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { createBrowserTabTool } from "../../../src/features/browser-tab/browser-tab-tool.js";
import {
	BROWSER_TAB_TOOL_ACTIONS,
	BROWSER_TAB_TOOL_NAME,
	type BrowserTabToolInput,
	browserTabToolError,
	describeBrowserTabToolInputProblem,
	formatBrowserTabToolResult,
} from "../../../src/features/browser-tab/browser-tab-tool-contract.js";

const signal = new AbortController().signal;

function text(result: { content: readonly unknown[] }): string {
	return String((result.content[0] as { text: string }).text);
}

async function executeRaw(input: unknown) {
	const tool = createBrowserTabTool({ invoke: async () => undefined });
	return tool.execute({
		sessionId: "s1",
		turnId: "t1",
		toolCallId: "c1",
		input: input as BrowserTabToolInput,
		signal,
	});
}

describe("browser_tab 可纠正的入参错误", () => {
	it("缺 action：列出全部合法动作与最小示例", async () => {
		const result = await executeRaw({});
		expect(result.isError).toBe(true);
		expect(result.details).toMatchObject({ code: "invalid_input" });
		const message = text(result);
		expect(message).toContain('missing "action"');
		expect(message).toContain('{"action":"snapshot"}');
		for (const action of BROWSER_TAB_TOOL_ACTIONS) expect(message).toContain(action);
	});

	it("非法 action：明确不支持并给出动作清单", () => {
		const message = describeBrowserTabToolInputProblem({ action: "evaluate", script: "1+1" });
		expect(message).toContain('does not support action "evaluate"');
		expect(message).toContain('{"action":"snapshot"}');
		for (const action of BROWSER_TAB_TOOL_ACTIONS) expect(message).toContain(action);
	});

	it("多余字段：指出字段名与该动作的合法字段", async () => {
		const result = await executeRaw({ action: "snapshot", eval: "no" });
		const message = text(result);
		expect(message).toContain('does not accept "eval"');
		expect(message).toContain("Allowed fields for snapshot: action, description, interactiveOnly.");
	});

	it("file:// 导航指向文件预览而不是浏览器页", async () => {
		const result = await executeRaw({ action: "navigate", url: "file:///tmp/index.html" });
		const message = text(result);
		expect(result.details).toMatchObject({ code: "invalid_input" });
		expect(message).toContain("file preview");
		expect(message).not.toContain("Open the in-app Browser page");
	});

	it("其他非 http(s) 协议给出收到的协议名与示例", () => {
		const message = describeBrowserTabToolInputProblem({ action: "navigate", url: "ftp://example.com" });
		expect(message).toContain('got "ftp"');
		expect(message).toContain('{"action":"navigate","url":"https://example.com"}');
	});

	it("畸形 elementRef 提示原样回传 snapshot 的 token", async () => {
		const result = await executeRaw({ action: "click", elementRef: "e1" });
		const message = text(result);
		expect(message).toContain("v1:<pageRevision>:<id>");
		expect(message).toContain("Take a snapshot");
	});

	it("validateInput 抛出同一段可纠正说明，而不是通用文本", () => {
		const tool = createBrowserTabTool({ invoke: async () => undefined });
		expect(() => tool.validateInput?.({})).toThrow(/missing "action"/);
	});

	it("合法调用仍把规范化入参交给宿主", async () => {
		const received: unknown[] = [];
		const tool = createBrowserTabTool({
			invoke: async (request) => {
				received.push(request.input);
				return { ok: true, action: "snapshot", pageRevision: 1 };
			},
		});
		const result = await tool.execute({
			sessionId: "s1",
			turnId: "t1",
			toolCallId: "c1",
			input: { action: "click", elementRef: "v1:3:e1" } as unknown as BrowserTabToolInput,
			signal,
		});
		expect(tool.name).toBe(BROWSER_TAB_TOOL_NAME);
		expect(result.isError).toBeUndefined();
		expect(received).toEqual([{ action: "click", elementRef: { id: "e1", pageRevision: 3 } }]);
	});
});

describe("browser_tab 恢复类错误文案", () => {
	it("无会话时要求先打开当前工作区的内置 Browser 页", () => {
		const message = text(
			formatBrowserTabToolResult(
				browserTabToolError("no_browser_session", "No in-app browser session is attached."),
			),
		);
		expect(message).toContain("Open the in-app Browser page in the current workspace");
		expect(message).toContain("retry with a fresh snapshot");
		expect(message).toContain("cannot succeed");
	});

	it("宿主不可用时提示求助用户而不是重试", async () => {
		const result = await executeRaw({ action: "snapshot" });
		const message = text(result);
		expect(result.details).toMatchObject({ code: "unimplemented", action: "snapshot" });
		expect(message).toContain("Ask the user to open the in-app Browser page");
	});
});

describe("browser_tab 与止损记账兼容", () => {
	it("相同坏参数重复得到的错误码稳定为 invalid_input", async () => {
		const codes: unknown[] = [];
		for (let index = 0; index < 3; index += 1) {
			const result = await executeRaw({ action: "fill", elementRef: "e1", value: "x" });
			codes.push((result.details as { code?: unknown }).code);
		}
		expect(codes).toEqual(["invalid_input", "invalid_input", "invalid_input"]);
	});
});
