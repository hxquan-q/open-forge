// Modified by The Open Forge contributors.
import { activeSessionAtom, activityPanelOpenAtom, sidebarCollapsedAtom } from "@shared/store/atoms";
import { getDefaultStore, useAtomValue } from "jotai";
import { useEffect, useRef } from "react";

type SessionProfile = "coding" | "work" | null;

function sessionProfileOf(capabilityProfile: string | undefined | null): SessionProfile {
	if (capabilityProfile === "coding") return "coding";
	if (capabilityProfile === "work") return "work";
	return null;
}

/**
 * 演示定稿（版块态布局）：进入 code 模式会话时自动收起左侧栏并打开右栏活动面板，
 * 切回普通会话时展开左栏。只在**档位迁移边沿**写状态——用户随后的手动开合不被覆盖，
 * 直到下一次跨档位切换。
 */
export function useCodingSessionLayout(): void {
	const activeSession = useAtomValue(activeSessionAtom);
	const profile = sessionProfileOf(activeSession?.capabilityProfile ?? null);
	const store = getDefaultStore();
	const prevProfileRef = useRef<SessionProfile>(null);

	useEffect(() => {
		const previous = prevProfileRef.current;
		prevProfileRef.current = profile;
		if (profile === previous) return;
		if (profile === "coding") {
			store.set(sidebarCollapsedAtom, true);
			store.set(activityPanelOpenAtom, true);
			return;
		}
		if (previous === "coding") {
			store.set(sidebarCollapsedAtom, false);
		}
	}, [profile, store]);
}
