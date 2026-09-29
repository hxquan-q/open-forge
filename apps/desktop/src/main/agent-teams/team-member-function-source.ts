// Copyright The Open Forge contributors.
import { CODING_AGENT_BROWSER_TAB_FUNCTION } from "@vetta/coding-agent/function-extensions";
import type { SessionExtensionFunctionSource } from "@vetta/runtime-core/session-extensions";

/**
 * 团队成员会话没有可绑定的应用内 WebView 后端，`browser_tab` 调用只会撞上
 * no_browser_session（ISSUE-0026）。把函数面对该 token 的可见性关掉后，
 * browser_tab 的 Session Extension 自然不贡献工具，模型不会再看到一条必失败路径；
 * invoke 仍然透传（能力查询与调用是两个面，防御性保留调用通道）。
 */
export function createTeamMemberFunctionSource(base: SessionExtensionFunctionSource): SessionExtensionFunctionSource {
	return {
		has: (token) => (token.id === CODING_AGENT_BROWSER_TAB_FUNCTION.id ? false : base.has(token)),
		invoke: (token, input, signal) => base.invoke(token, input, signal),
	};
}
