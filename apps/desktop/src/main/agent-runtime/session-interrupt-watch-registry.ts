// Copyright The Open Forge contributors.
/** 候选会话与手动停止标记，供巡检器扫描。 */
const candidates = new Set<string>();
const manualStops = new Set<string>();

export function watchSessionForInterruptContinue(sessionId: string): void {
	if (!sessionId) return;
	candidates.add(sessionId);
}

export function unwatchSessionForInterruptContinue(sessionId: string): void {
	candidates.delete(sessionId);
	manualStops.delete(sessionId);
}

export function markSessionManualStop(sessionId: string): void {
	if (!sessionId) return;
	manualStops.add(sessionId);
	candidates.add(sessionId);
}

export function clearSessionManualStop(sessionId: string): void {
	manualStops.delete(sessionId);
}

export function wasSessionManualStopped(sessionId: string): boolean {
	return manualStops.has(sessionId);
}

export function listInterruptContinueCandidates(): readonly string[] {
	return [...candidates];
}

export function clearInterruptContinueWatchState(): void {
	candidates.clear();
	manualStops.clear();
}
