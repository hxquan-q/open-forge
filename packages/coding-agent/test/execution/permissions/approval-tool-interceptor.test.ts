import { describe, expect, it } from "vitest";
import type {
	CodingAgentToolApprovalDecision,
	CodingAgentToolApprovalPort,
} from "../../../src/execution/permissions/approval-contract.js";
import { createApprovalToolInterceptor } from "../../../src/execution/permissions/approval-tool-interceptor.js";
import { summarizeToolApproval } from "../../../src/execution/permissions/summarize-tool-approval.js";
import { defaultToolRiskDescriptor } from "../../../src/execution/permissions/tool-risk-descriptors.js";
import type {
	ToolInterceptionBeforeResult,
	ToolInterceptionContext,
} from "../../../src/interception/tool/contracts.js";

function fakePort(decisions: readonly CodingAgentToolApprovalDecision[]): {
	readonly port: CodingAgentToolApprovalPort;
	readonly requests: unknown[];
} {
	const requests: unknown[] = [];
	let index = 0;
	const port: CodingAgentToolApprovalPort = {
		isAvailable: () => true,
		request: async (input) => {
			requests.push(input);
			return decisions[Math.min(index++, decisions.length - 1)] ?? { decision: "deny" };
		},
	};
	return { port, requests };
}

function contextFor(toolName: string, input: Readonly<Record<string, unknown>> = {}): ToolInterceptionContext {
	return {
		tool: {
			name: toolName,
			label: toolName,
			description: "",
			inputSchema: {} as never,
			validateInput: (input) => input,
			execute: () => Promise.resolve({ content: [] }),
		},
		request: {
			sessionId: "session-1",
			turnId: "turn-1",
			toolCallId: "call-1",
			input,
			signal: new AbortController().signal,
		},
		frameContext: undefined,
		input,
	};
}

function interceptorWith(port: CodingAgentToolApprovalPort | undefined) {
	return createApprovalToolInterceptor({
		approvalPort: port,
		resolveRiskDescriptor: defaultToolRiskDescriptor,
		summarize: summarizeToolApproval,
	});
}

describe("approval tool interceptor", () => {
	it("端口不可用时完全不设闸（CLI/未接入宿主保持既有行为）", async () => {
		const unavailable: CodingAgentToolApprovalPort = {
			isAvailable: () => false,
			request: () => Promise.resolve({ decision: "approve" }),
		};
		expect(await interceptorWith(unavailable).before?.(contextFor("bash", { command: "rm -rf /" }))).toBeUndefined();
		expect(await interceptorWith(undefined).before?.(contextFor("bash"))).toBeUndefined();
	});

	it("L0/L2 等自动等级不触发审批", async () => {
		const { port } = fakePort([{ decision: "deny" }]);
		const read = await interceptorWith(port).before?.(contextFor("read", { path: "a.ts" }));
		const write = await interceptorWith(port).before?.(contextFor("write", { file_path: "a.ts", content: "x" }));
		expect(read).toBeUndefined();
		expect(write).toBeUndefined();
	});

	it("L3 工具请求审批；批准后放行，拒绝则阻塞", async () => {
		const approving = fakePort([{ decision: "approve" }]);
		const allowed = await interceptorWith(approving.port).before?.(contextFor("bash", { command: "npm install" }));
		expect(allowed).toEqual({});

		const denying = fakePort([{ decision: "deny" }]);
		const blocked: ToolInterceptionBeforeResult | undefined = await interceptorWith(denying.port).before?.(
			contextFor("bash", { command: "npm install" }),
		);
		expect(blocked?.block?.reason).toContain("denied");
	});

	it("审批请求携带等级、脱敏摘要与稳定 approvalId", async () => {
		const { port, requests } = fakePort([{ decision: "approve_once" }]);
		await interceptorWith(port).before?.(contextFor("bash", { command: "npm install" }));
		expect(requests).toHaveLength(1);
		const request = requests[0] as { level: string; summary: string; approvalId: string; turnId: string };
		expect(request.level).toBe("L3");
		expect(request.summary).toContain("npm install");
		expect(request.approvalId).toContain("call-1");
		expect(request.turnId).toBe("turn-1");
	});

	it("未知工具 fail closed 到逐次审批", async () => {
		const { port } = fakePort([{ decision: "deny" }]);
		const blocked = await interceptorWith(port).before?.(contextFor("mystery_tool"));
		expect(blocked?.block).toBeDefined();
	});

	it("edit 决策生成新审批请求并采用改写参数；改写后批准才放行", async () => {
		const { port, requests } = fakePort([
			{ decision: "edit", input: { command: "npm ci" } },
			{ decision: "approve_once" },
		]);
		const result = await interceptorWith(port).before?.(contextFor("bash", { command: "npm install" }));
		expect(result).toEqual({});
		expect(requests).toHaveLength(2);
		const second = requests[1] as { inputPreview: { command: string }; approvalId: string };
		expect(second.inputPreview.command).toBe("npm ci");
		expect(second.approvalId).not.toBe((requests[0] as { approvalId: string }).approvalId);
	});

	it("审批端口抛错时 fail closed（调用失败不视作批准）", async () => {
		const port: CodingAgentToolApprovalPort = {
			isAvailable: () => true,
			request: () => Promise.reject(new Error("broker gone")),
		};
		await expect(interceptorWith(port).before?.(contextFor("bash", { command: "ls" }))).rejects.toThrow(
			"broker gone",
		);
	});
});

describe("summarizeToolApproval", () => {
	it("只保留可读键与资源路径，不携带文件内容", () => {
		const { summary, affectedResources } = summarizeToolApproval("bash", {
			command: "rm -rf build",
			content: "极长的文件内容不应进入摘要",
			file_path: "build/x.js",
		});
		expect(summary).toContain("rm -rf build");
		expect(summary).not.toContain("极长的文件内容");
		expect(affectedResources).toEqual(["build/x.js"]);
	});
});
