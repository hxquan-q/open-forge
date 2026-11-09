// Copyright The Open Forge contributors.
import {
	CODING_AGENT_NEXT_PROMPT_SUGGESTIONS,
	CODING_AGENT_SESSION_TITLE_GENERATE,
} from "@vetta/coding-agent/session-extensions";
import type { HostDomainImplementation, SESSION_TITLE_HOST_METHODS } from "@vetta/host-protocol";
import { assertOrdinaryConversationPath } from "../conversations/conversation-ownership-guard.js";
import { getSharedRuntime } from "../runtime.js";

/**
 * 会话标题与建议子域的 Host 实现（TASK-0470）：与旧 IPC handler 同职责，
 * 只换合同入口——rename 保留所有权守卫，autoTitle 空文本对返回 null 并在
 * 生成标题后回写，suggestions 空 conversation 返回 []。
 */
export const sessionTitleHostDomain: HostDomainImplementation<typeof SESSION_TITLE_HOST_METHODS> = {
	rename: async ({ sessionPath, name }) => {
		await assertOrdinaryConversationPath(sessionPath);
		await getSharedRuntime().renameSession(sessionPath, name);
		return null;
	},
	autoTitle: async ({ sessionId, userText, assistantText }) => {
		if (userText.trim().length === 0 && assistantText.trim().length === 0) return null;
		const runtime = getSharedRuntime();
		const title = await runtime.invokeSessionExtension(sessionId, CODING_AGENT_SESSION_TITLE_GENERATE, {
			userText,
			assistantText,
		});
		if (title) await runtime.renameSessionById(sessionId, title);
		return title;
	},
	nextPromptSuggestions: async ({ sessionId, conversation }) => {
		if (conversation.trim().length === 0) return [];
		return [
			...(await getSharedRuntime().invokeSessionExtension(sessionId, CODING_AGENT_NEXT_PROMPT_SUGGESTIONS, {
				conversation,
			})),
		];
	},
};
