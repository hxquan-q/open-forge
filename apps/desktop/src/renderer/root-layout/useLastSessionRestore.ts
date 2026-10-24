// Modified by The Open Forge contributors.
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";
import type { SessionOpenerController } from "../domains/conversation/hooks/useSessionOpener";
import {
	activeSessionAtom,
	lastActiveSessionAtom,
	pendingSessionCreationAtom,
	pendingSessionOpenAtom,
} from "../shared/store/atoms";

type SessionRestoreState = "pending" | "restoring" | "complete";

export function useLastSessionRestore(
	currentPath: string,
	openSession: SessionOpenerController["openSession"],
): SessionRestoreState {
	const activeSession = useAtomValue(activeSessionAtom);
	const pendingSessionCreation = useAtomValue(pendingSessionCreationAtom);
	const pendingSessionOpen = useAtomValue(pendingSessionOpenAtom);
	const [lastActiveSession, setLastActiveSession] = useAtom(lastActiveSessionAtom);
	const setActiveSession = useSetAtom(activeSessionAtom);
	const [state, setState] = useState<SessionRestoreState>("pending");
	const attemptedRef = useRef(false);

	// 刷新根路由时先用持久化的 cwd + sessionPath 重建 runtime session。
	// 持久化定位信息已足够恢复，无需等待默认 cwd 或侧栏历史列表完成加载。
	// runtimeId 不能跨 renderer 生命周期复用，必须重新走 openSession/session.create。
	useEffect(() => {
		if (currentPath !== "/" || attemptedRef.current) return;
		attemptedRef.current = true;
		if (activeSession || pendingSessionCreation || pendingSessionOpen || !lastActiveSession) {
			setState("complete");
			return;
		}
		setState("restoring");
		void openSession(lastActiveSession.cwd, lastActiveSession.sessionPath, undefined, { historyLoadMode: "tail" })
			.catch((error: unknown) => {
				console.warn("[RootLayout] restore active session failed", error);
				setActiveSession(null);
				setLastActiveSession(null);
			})
			.finally(() => setState("complete"));
	}, [
		currentPath,
		activeSession,
		pendingSessionCreation,
		pendingSessionOpen,
		lastActiveSession,
		openSession,
		setActiveSession,
		setLastActiveSession,
	]);

	return state;
}
