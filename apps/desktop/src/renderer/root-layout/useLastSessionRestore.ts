// Modified by The Open Forge contributors.

import { useNavigate } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import {
	activeSessionAtom,
	lastActiveSessionAtom,
	pendingSessionCreationAtom,
	pendingSessionOpenAtom,
} from "../shared/store/atoms";

type SessionRestoreState = "pending" | "restoring" | "complete";

/**
 * 演示定稿：应用启动（根路由）不再恢复上次会话，默认落新会话页。版块态布局是
 * 一次性初始化（useCodingSessionLayout，进入 code 语境收左栏开右栏），"恢复上次
 * 会话"路径绕过了它——上次退出时左栏的收起状态在重启后表现为又弹开。新会话页
 * 按默认项目档位走：coding 档会正确触发版块态初始化。状态机保留
 * pending/restoring/complete 供根路由骨架使用。
 */
export function useLastSessionRestore(currentPath: string): SessionRestoreState {
	const navigate = useNavigate();
	const activeSession = useAtomValue(activeSessionAtom);
	const pendingSessionCreation = useAtomValue(pendingSessionCreationAtom);
	const pendingSessionOpen = useAtomValue(pendingSessionOpenAtom);
	const setLastActiveSession = useSetAtom(lastActiveSessionAtom);
	const [state, setState] = useState<SessionRestoreState>("pending");
	const attemptedRef = useRef(false);

	useEffect(() => {
		if (currentPath !== "/" || attemptedRef.current) return;
		attemptedRef.current = true;
		// 已有活动/进行中的会话（如深链先落）不抢跳，保持原路由行为。
		if (activeSession || pendingSessionCreation || pendingSessionOpen) {
			setState("complete");
			return;
		}
		// 持久化的上次会话定位不再自动恢复；顺手清掉，避免残留误导后续消费者。
		setLastActiveSession(null);
		setState("restoring");
		void navigate({ to: "/new-session" })
			.catch((error: unknown) => {
				console.warn("[RootLayout] navigate to new session failed", error);
			})
			.finally(() => setState("complete"));
	}, [currentPath, activeSession, pendingSessionCreation, pendingSessionOpen, navigate, setLastActiveSession]);

	return state;
}
