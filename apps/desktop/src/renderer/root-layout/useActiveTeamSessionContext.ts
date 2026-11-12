// Modified by The Open Forge contributors.
import { activeTeamSessionAtom } from "@shared/store/atoms";
import { useMatches } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";

/** 普通会话所在的会话面路由：进入即取代团队语境（团队会话没有 activeSession 投影）。 */
function isNormalConversationSurface(pathname: string): boolean {
	return pathname === "/" || pathname.startsWith("/project/") || pathname.startsWith("/new-session");
}

/**
 * 团队会话语境跟踪（BUG-0187）：把「当前语境是哪个团队会话」写进全局
 * activeTeamSessionAtom，供 computer-use 授权页等跨页消费（授权主体 = 团队语境
 * ?? activeSessionAtom）。路由参数提取与 useProjectsPanelModel 同一模式。
 *
 * - 团队会话路由（含成员子路由）激活时记录 {teamId, sessionId}；
 * - 进入普通会话面（/、/project/$cwd、/new-session*）时清空——普通会话的语境
 *   由 activeSessionAtom 承载，两者互斥；
 * - 其余路由（/computer-use、设置、团队列表页等）保留现值：从团队会话切去
 *   授权页时语境必须仍在。
 */
export function useActiveTeamSessionContext(): void {
	const matches = useMatches();
	const lastMatch = matches[matches.length - 1];
	const currentPath = lastMatch?.pathname ?? "/";
	const routeParams = lastMatch?.params as { teamId?: string; sessionId?: string } | undefined;
	const setActiveTeamSession = useSetAtom(activeTeamSessionAtom);
	const activeTeamSession = useAtomValue(activeTeamSessionAtom);

	useEffect(() => {
		if (currentPath.startsWith("/agent-teams/")) {
			const teamId = routeParams?.teamId ? decodeURIComponent(routeParams.teamId) : "";
			const sessionId = routeParams?.sessionId ? decodeURIComponent(routeParams.sessionId) : "";
			if (
				teamId &&
				sessionId &&
				(activeTeamSession?.teamId !== teamId || activeTeamSession?.sessionId !== sessionId)
			) {
				setActiveTeamSession({ teamId, sessionId });
			}
			return;
		}
		if (isNormalConversationSurface(currentPath) && activeTeamSession) setActiveTeamSession(null);
	}, [activeTeamSession, currentPath, routeParams?.sessionId, routeParams?.teamId, setActiveTeamSession]);
}
