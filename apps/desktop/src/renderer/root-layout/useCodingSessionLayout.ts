// Modified by The Open Forge contributors.
import {
	activeSessionAtom,
	activityPanelOpenAtom,
	codingLayoutActiveAtom,
	codingSessionCreateIntentAtom,
	defaultConversationCwdAtom,
	readWorkspaceModeFor,
	setActivityPanelWidthAtom,
	sidebarCollapsedAtom,
	workspaceModeByProjectAtom,
} from "@shared/store/atoms";
import { useMatches, useSearch } from "@tanstack/react-router";
import { getDefaultStore, useAtomValue } from "jotai";
import { useCallback, useEffect, useRef } from "react";

/** 版块态判定与侧栏「Allstar自主开发」入口的高亮口径一致（useSidebarModel）。 */
function decodeRouteCwd(value: string | undefined): string | null {
	if (!value) return null;
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

/** 哪条规则命中了版块态：决定初始化走意图还是保留的边沿语境。 */
type CodingLayoutContext = "session" | "team" | "new-session" | null;

function useCodingLayoutState(): { active: boolean; context: CodingLayoutContext } {
	const matches = useMatches();
	const lastMatch = matches[matches.length - 1];
	const currentPath = lastMatch?.pathname ?? "/";
	const search = useSearch({ strict: false }) as { cwd?: string };
	const activeSession = useAtomValue(activeSessionAtom);
	const workspaceModeMap = useAtomValue(workspaceModeByProjectAtom);
	const defaultConversationCwd = useAtomValue(defaultConversationCwdAtom);

	// 1) 活动的普通会话是 code 档（创建时固化）。
	if (activeSession?.capabilityProfile === "coding") return { active: true, context: "session" };
	// 2) 团队会话路由：团队会话天生 coding 档（TEAM_CAPABILITY_PROFILE），
	//    但 TeamChatPage 不写 activeSessionAtom，按路由判定。
	if (currentPath.startsWith("/agent-teams")) return { active: true, context: "team" };
	// 3) 开发档的新会话页：发出首条消息前还没有 activeSession，按项目档位近似。
	if (currentPath === "/new-session") {
		const routeCwd = decodeRouteCwd(search.cwd) ?? defaultConversationCwd ?? null;
		if (readWorkspaceModeFor(workspaceModeMap, routeCwd) === "coding") {
			return { active: true, context: "new-session" };
		}
	}
	return { active: false, context: null };
}

/**
 * 会话区与右栏对半分时，窗口坐标里不属于这两列的固定开销：AppFrame 内衬 p-2
 * 两侧共 16 + 列间 gap-2 的 8（口径同 ACTIVITY_PANEL_MIN_CHAT_AREA 的注释）。
 */
const SPLIT_FIXED_OVERHEAD_PX = 24;

/**
 * 版块态布局 = 一次性初始化（BUG-0158 后由**新建意图**驱动）：收起左侧栏、打开
 * 右栏活动面板，会话区与右栏宽度对半分。初始化绑定创建意图（beginCodingSessionCreation
 * 登记，nonce 消费一次）——连续新建各自初始化；发首条消息的路由过渡（active 抖动）
 * 不重复、不覆盖手动选择；打开既有 coding 会话不冒充新建。团队路由与开发档新会话页
 * 的进入仍走边沿初始化（语境明确是「进入」，与现状一致）。
 *
 * **离开时不做任何回写**——code 会话里左栏默认收起，用户要切去普通会话必先手动
 * 展开左栏，离开时刻的左栏状态就是用户想要的状态，自动展开只会制造弹跳。此后的
 * 手动开合与拖宽永不被覆盖。
 */
export function useCodingSessionLayout(): void {
	const { active, context } = useCodingLayoutState();
	const intent = useAtomValue(codingSessionCreateIntentAtom);
	const store = getDefaultStore();
	const appliedIntentRef = useRef(0);
	const prevActiveRef = useRef<boolean | null>(null);

	// 判定同步进全局 atom：宽度联动等旁路写入方据此克制，active 期间不恢复侧栏。
	useEffect(() => {
		store.set(codingLayoutActiveAtom, active);
	}, [active, store]);

	const applyInitialLayout = useCallback(() => {
		store.set(sidebarCollapsedAtom, true);
		store.set(activityPanelOpenAtom, true);
		// 对半分落成当时的固定像素（初始化语义：此后不随窗口 resize 跟随）；
		// 窄窗口下由 resolveActivityPanelWidth 夹到 [260, 窗口-384]。
		store.set(setActivityPanelWidthAtom, Math.round((window.innerWidth - SPLIT_FIXED_OVERHEAD_PX) / 2));
	}, [store]);

	// 意图驱动：每个创建意图在 code 语境首次成立时应用一次；意图消费后，语境内的
	// 一切后续变化（会话对象更新、active 抖动回真）都不再初始化。
	useEffect(() => {
		if (!intent || !active) return;
		if (appliedIntentRef.current === intent.nonce) return;
		appliedIntentRef.current = intent.nonce;
		applyInitialLayout();
	}, [intent, active, applyInitialLayout]);

	// 边沿驱动（保留现状的两类语境）：团队路由进入、开发档新会话页进入（含页面内
	// 档位切到 coding）。已提交 coding 会话不走边沿——打开既有会话不初始化。
	useEffect(() => {
		const previous = prevActiveRef.current;
		prevActiveRef.current = active;
		if (!active || active === previous) return;
		if (context === "team" || context === "new-session") applyInitialLayout();
	}, [active, context, applyInitialLayout]);
}
