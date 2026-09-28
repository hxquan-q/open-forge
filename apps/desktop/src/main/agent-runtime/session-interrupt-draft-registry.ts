// Copyright The Open Forge contributors.
/**
 * Renderer → Main 输入草稿镜像：判定层「非空草稿一票否决」需要主进程可见证据。
 * 仅存 hasNonEmpty 布尔，不持久化正文。
 */
const draftNonEmptyBySessionId = new Map<string, boolean>();

export function setSessionInterruptDraftNonEmpty(sessionId: string, nonEmpty: boolean): void {
	if (!sessionId) return;
	if (nonEmpty) draftNonEmptyBySessionId.set(sessionId, true);
	else draftNonEmptyBySessionId.delete(sessionId);
}

export function isSessionInterruptDraftNonEmpty(sessionId: string): boolean {
	return draftNonEmptyBySessionId.get(sessionId) === true;
}

export function clearSessionInterruptDraft(sessionId: string): void {
	draftNonEmptyBySessionId.delete(sessionId);
}

export function clearAllSessionInterruptDrafts(): void {
	draftNonEmptyBySessionId.clear();
}
