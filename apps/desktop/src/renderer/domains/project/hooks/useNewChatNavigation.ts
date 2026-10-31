// Modified by The Open Forge contributors.
import {
	activeSessionAtom,
	conversationBucketCwd,
	DEFAULT_WORKSPACE_MODE,
	defaultConversationCwdAtom,
	enterWorkspaceSection,
} from "@shared/store/atoms";
import { useMatches, useNavigate } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";

/**
 * 「新会话」入口：文档与研究（默认档）版块的进入点。目标项目可能停留在上一次的
 * 开发档，这里统一回落，保证新会话默认按文档与研究开。「Allstar自主开发」版块入口
 * 已改为导航版块首页 /allstar（ADR-0151，见 useSidebarModel 的 openNavItem 分发），
 * 开发会话的创建由版块内动作写 coding 档。
 *
 * 目标 cwd 解析顺序：
 *   1. 当前路由参数 cwd（/project/$cwd 或 /new-session/$cwd）—— 项目详情聚焦
 *   2. 仅在聊天页（/）时，跟随 activeSession 的 cwd —— 聚焦的是「某项目的会话」时落到该项目。
 *      ADR-0007：默认「对话」session 的运行 cwd 是默认项目根下的 per-session 子目录，
 *      必须归一回项目根，否则新会话会挂到子目录 bucket、不在「会话」列表出现。
 *   3. 其余一切场景（自动化/批量任务/Claw 查看器/设置等）落到默认「会话」项目，
 *      不能沿用残留的 activeSession.cwd，否则会把新会话建到上一个项目里。
 */
function useNewSessionTargetCwd(): string {
	const matches = useMatches();
	const lastMatch = matches[matches.length - 1];
	const currentPath = lastMatch?.pathname ?? "/";
	const activeSession = useAtomValue(activeSessionAtom);
	const defaultConversationCwd = useAtomValue(defaultConversationCwdAtom);

	const params = lastMatch?.params as { cwd?: string } | undefined;
	if (params?.cwd) {
		try {
			return decodeURIComponent(params.cwd);
		} catch {
			return params.cwd;
		}
	}
	if (currentPath === "/" && activeSession?.cwd) {
		return conversationBucketCwd(activeSession.cwd, defaultConversationCwd);
	}
	return defaultConversationCwd || "";
}

/** 目标 cwd 为空时从主进程配置补默认「会话」项目，并回填缓存 atom。 */
async function resolveNewSessionCwd(initial: string, cacheDefault: (cwd: string) => void): Promise<string | null> {
	if (initial) return initial;
	try {
		const config = await window.vetta.config.get();
		const targetCwd = config.defaultConversationCwd ?? "";
		if (targetCwd) cacheDefault(targetCwd);
		return targetCwd || null;
	} catch (error) {
		console.error("[NewChat] failed to resolve default conversation cwd", error);
		return null;
	}
}

export function useNewChatNavigation(): () => void {
	const navigate = useNavigate();
	const newChatCwd = useNewSessionTargetCwd();
	const setDefaultConversationCwd = useSetAtom(defaultConversationCwdAtom);

	return useCallback(() => {
		void (async () => {
			const targetCwd = await resolveNewSessionCwd(newChatCwd, setDefaultConversationCwd);
			if (!targetCwd) return;
			enterWorkspaceSection(targetCwd, DEFAULT_WORKSPACE_MODE);
			void navigate({
				to: "/new-session/$cwd",
				params: { cwd: encodeURIComponent(targetCwd) },
			});
		})();
	}, [navigate, newChatCwd, setDefaultConversationCwd]);
}
