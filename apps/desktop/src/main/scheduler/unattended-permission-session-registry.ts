// Copyright The Open Forge contributors.
/**
 * 自动化会话 → 无人值守授权分档 的进程内绑定。
 * task-executor 在建会话时写入，审批 broker 读取；会话结束解绑。
 */
import type { UnattendedPermissionTiers } from "@vetta/coding-agent/runtime";

const sessionTiers = new Map<string, UnattendedPermissionTiers>();

export function bindUnattendedPermissionTiers(sessionId: string, tiers: UnattendedPermissionTiers | undefined): void {
	if (!tiers || Object.keys(tiers).length === 0) {
		sessionTiers.delete(sessionId);
		return;
	}
	const granted = Object.fromEntries(
		Object.entries(tiers).filter(([, enabled]) => enabled === true),
	) as UnattendedPermissionTiers;
	if (Object.keys(granted).length === 0) {
		sessionTiers.delete(sessionId);
		return;
	}
	sessionTiers.set(sessionId, granted);
}

export function unbindUnattendedPermissionTiers(sessionId: string): void {
	sessionTiers.delete(sessionId);
}

export function getUnattendedPermissionTiersForSession(sessionId: string): UnattendedPermissionTiers | undefined {
	return sessionTiers.get(sessionId);
}

/** 仅测试：清空进程内绑定。 */
export function clearUnattendedPermissionTierForTests(): void {
	sessionTiers.clear();
}
