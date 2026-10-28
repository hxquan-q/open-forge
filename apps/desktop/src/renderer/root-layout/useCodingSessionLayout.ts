// Modified by The Open Forge contributors.
import {
	activeSessionAtom,
	activityPanelOpenAtom,
	defaultConversationCwdAtom,
	readWorkspaceModeFor,
	sidebarCollapsedAtom,
	workspaceModeByProjectAtom,
} from "@shared/store/atoms";
import { useMatches, useSearch } from "@tanstack/react-router";
import { getDefaultStore, useAtomValue } from "jotai";
import { useEffect, useRef } from "react";

/** 版块态判定与侧栏「Allstar自主开发」入口的高亮口径一致（useSidebarModel）。 */
function decodeRouteCwd(value: string | undefined): string | null {
	if (!value) return null;
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function useCodingLayoutActive(): boolean {
	const matches = useMatches();
	const lastMatch = matches[matches.length - 1];
	const currentPath = lastMatch?.pathname ?? "/";
	const search = useSearch({ strict: false }) as { cwd?: string };
	const activeSession = useAtomValue(activeSessionAtom);
	const workspaceModeMap = useAtomValue(workspaceModeByProjectAtom);
	const defaultConversationCwd = useAtomValue(defaultConversationCwdAtom);

	// 1) 活动的普通会话是 code 档（创建时固化）。
	if (activeSession?.capabilityProfile === "coding") return true;
	// 2) 团队会话路由：团队会话天生 coding 档（TEAM_CAPABILITY_PROFILE），
	//    但 TeamChatPage 不写 activeSessionAtom，按路由判定。
	if (currentPath.startsWith("/agent-teams")) return true;
	// 3) 开发档的新会话页：发出首条消息前还没有 activeSession，按项目档位近似。
	if (currentPath === "/new-session") {
		const routeCwd = decodeRouteCwd(search.cwd) ?? defaultConversationCwd ?? null;
		return readWorkspaceModeFor(workspaceModeMap, routeCwd) === "coding";
	}
	return false;
}

/**
 * 演示定稿（版块态布局）：进入 code 模式语境（coding 会话、团队会话路由、开发档
 * 新会话页）时自动收起左侧栏并打开右栏活动面板，离开时展开左栏。只在**状态迁移
 * 边沿**写状态——用户随后的手动开合不被覆盖，直到下一次跨态切换。
 */
export function useCodingSessionLayout(): void {
	const active = useCodingLayoutActive();
	const store = getDefaultStore();
	const prevRef = useRef<boolean | null>(null);

	useEffect(() => {
		const previous = prevRef.current;
		prevRef.current = active;
		if (active === previous) return;
		// 临时诊断（演示走查）：定位左栏意外弹回的写入方，定位后移除。
		console.debug("[sidebar-diag] coding-layout edge", { active, previous });
		if (active) {
			store.set(sidebarCollapsedAtom, true);
			store.set(activityPanelOpenAtom, true);
			return;
		}
		if (previous === true) {
			store.set(sidebarCollapsedAtom, false);
		}
	}, [active, store]);
}
