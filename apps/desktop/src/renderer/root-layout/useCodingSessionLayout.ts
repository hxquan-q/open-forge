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

/** 展开延迟：吸收「发首条消息」的过渡闪断（新会话页→聊天页瞬间 activeSession 未提交，版块态会短暂判否）。 */
const LEAVE_DELAY_MS = 1200;

/**
 * 演示定稿（版块态布局）：进入 code 模式语境（coding 会话、团队会话路由、开发档
 * 新会话页）时**立即**收起左侧栏并打开右栏活动面板；离开时**延迟**展开——新会话页
 * 发出首条消息跳到聊天页的瞬间，activeSession 尚未提交，版块态会短暂判否（真因见
 * 演示走查诊断），稳定离开才展开。只在**状态迁移边沿**写状态，用户随后的手动开合
 * 不被覆盖。
 */
export function useCodingSessionLayout(): void {
	const active = useCodingLayoutActive();
	const store = getDefaultStore();
	const prevRef = useRef<boolean | null>(null);

	useEffect(() => {
		const previous = prevRef.current;
		if (active === previous) return;
		prevRef.current = active;
		if (active) {
			store.set(sidebarCollapsedAtom, true);
			store.set(activityPanelOpenAtom, true);
			return;
		}
		if (previous !== true) return;
		const timer = window.setTimeout(() => {
			// 计时期间版块态若恢复（activeSession 提交完成），这里已是过期的展开——
			// 以最新状态为准，不再展开。
			if (prevRef.current === true) return;
			store.set(sidebarCollapsedAtom, false);
		}, LEAVE_DELAY_MS);
		return () => window.clearTimeout(timer);
	}, [active, store]);
}
