// Modified by The Open Forge contributors.
import {
	activeSessionAtom,
	activityPanelOpenAtom,
	codingLayoutActiveAtom,
	defaultConversationCwdAtom,
	readWorkspaceModeFor,
	setActivityPanelWidthAtom,
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
 * 会话区与右栏对半分时，窗口坐标里不属于这两列的固定开销：AppFrame 内衬 p-2
 * 两侧共 16 + 列间 gap-2 的 8（口径同 ACTIVITY_PANEL_MIN_CHAT_AREA 的注释）。
 */
const SPLIT_FIXED_OVERHEAD_PX = 24;

/**
 * 演示定稿（版块态布局 = 一次性初始化）：**进入** code 语境（coding 会话、团队会话
 * 路由、开发档新会话页）时收起左侧栏、打开右栏活动面板，并把会话区与右栏的宽度
 * 初始化为对半分；**离开时不做任何回写**——code 会话里左栏默认收起，用户要切去
 * 普通会话必先手动展开左栏，离开时刻的左栏状态就是用户想要的状态，自动展开只会
 * 制造弹跳（发首条消息跳聊天页的过渡窗口、插件加载慢于任何固定延迟都会把刚收起
 * 的左栏弹开）。右栏同理交给用户与页面自身逻辑。只在**进入边沿**写一次，此后的
 * 手动开合与拖宽永不被覆盖。
 */
export function useCodingSessionLayout(): void {
	const active = useCodingLayoutActive();
	const store = getDefaultStore();
	const prevRef = useRef<boolean | null>(null);

	// 判定同步进全局 atom：宽度联动等旁路写入方据此克制，active 期间不恢复侧栏。
	useEffect(() => {
		store.set(codingLayoutActiveAtom, active);
	}, [active, store]);

	useEffect(() => {
		const previous = prevRef.current;
		if (active === previous) return;
		prevRef.current = active;
		if (active) {
			store.set(sidebarCollapsedAtom, true);
			store.set(activityPanelOpenAtom, true);
			// 对半分落成当时的固定像素（初始化语义：此后不随窗口 resize 跟随）；
			// 窄窗口下由 resolveActivityPanelWidth 夹到 [260, 窗口-384]。
			store.set(setActivityPanelWidthAtom, Math.round((window.innerWidth - SPLIT_FIXED_OVERHEAD_PX) / 2));
		}
	}, [active, store]);
}
