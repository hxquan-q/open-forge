// Modified by The Open Forge contributors.
import {
	activeSessionAtom,
	conversationBucketCwd,
	DEFAULT_WORKSPACE_MODE,
	defaultConversationCwdAtom,
	enterWorkspaceSection,
	type WorkspaceMode,
} from "@shared/store/atoms";
import { useMatches, useNavigate } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";

/**
 * 新会话版块入口的统一行为：解析目标项目 cwd、写入版块档位，再跳转到 NewSession 页。
 * 「新会话」与「Allstar自主开发」两个入口共用同一套解析与导航，只在档位上分叉，
 * 避免目标 cwd 解析规则出现第二处实现。
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

function useWorkspaceSectionNavigation(mode: WorkspaceMode): () => void {
	const navigate = useNavigate();
	const newChatCwd = useNewSessionTargetCwd();
	const setDefaultConversationCwd = useSetAtom(defaultConversationCwdAtom);

	return useCallback(() => {
		void (async () => {
			const targetCwd = await resolveNewSessionCwd(newChatCwd, setDefaultConversationCwd);
			if (!targetCwd) return;
			enterWorkspaceSection(targetCwd, mode);
			void navigate({
				to: "/new-session/$cwd",
				params: { cwd: encodeURIComponent(targetCwd) },
			});
		})();
	}, [mode, navigate, newChatCwd, setDefaultConversationCwd]);
}

/**
 * 「新会话」入口：文档与研究（默认档）版块的进入点。目标项目可能停留在上一次的
 * 开发档，这里统一回落，保证新会话默认按文档与研究开。
 */
export function useNewChatNavigation(): () => void {
	return useWorkspaceSectionNavigation(DEFAULT_WORKSPACE_MODE);
}

/**
 * 「Allstar自主开发」版块入口：目标项目解析与「新会话」一致，区别只是进入前把该项目
 * 档位写为 coding——落在同一张 NewSession 页上，确认句与创建出的会话按代码模式走。
 */
export function useAllstarDevNavigation(): () => void {
	return useWorkspaceSectionNavigation("coding");
}
