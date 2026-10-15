// Copyright The Open Forge contributors.
import { CODING_AGENT_BROWSER_TAB_FUNCTION } from "@vetta/coding-agent/function-extensions";
import type {
	SessionExtensionFunctionSource,
	SessionExtensionFunctionToken,
} from "@vetta/runtime-core/session-extensions";
import { describe, expect, it, vi } from "vitest";
import { createTeamMemberFunctionSource } from "./team-member-function-source.js";

const OTHER_TOKEN: SessionExtensionFunctionToken<string, string> = Object.freeze({
	id: "test.other-function",
	extensionId: "test",
});

function baseSource(): SessionExtensionFunctionSource {
	return {
		has: vi.fn(() => true),
		invoke: vi.fn(async (_token: unknown, input: unknown) => `invoked:${String(input)}` as never),
	};
}

describe("createTeamMemberFunctionSource（TASK-0123）", () => {
	it("对 browser_tab 函数 token 报告不可用，其余函数照常透传", () => {
		const base = baseSource();
		const source = createTeamMemberFunctionSource(base);

		expect(source.has(CODING_AGENT_BROWSER_TAB_FUNCTION)).toBe(false);
		expect(source.has(OTHER_TOKEN)).toBe(true);
		expect(base.has).not.toHaveBeenCalledWith(CODING_AGENT_BROWSER_TAB_FUNCTION);
	});

	it("invoke 不拦截：被隐藏的工具若被绕过广告面调用，仍按真实后端语义处理", async () => {
		const base = baseSource();
		const source = createTeamMemberFunctionSource(base);

		await expect(source.invoke(CODING_AGENT_BROWSER_TAB_FUNCTION, "x" as never)).resolves.toBe("invoked:x");
	});
});
