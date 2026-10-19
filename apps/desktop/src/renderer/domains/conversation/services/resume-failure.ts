// Copyright The Open Forge contributors.

/**
 * 续跑（`session.retry`）失败的归类。
 *
 * 宿主经 IPC 只把错误文本透传给渲染端，`KernelError` 的 `code` 字段不会跨进程存活，
 * 因此这里按内核稳定文案归类；未命中一律降级为 `unknown`，由调用方显示通用文案。
 *
 * 文案锚点（`packages/runtime-core/src/kernel/errors.ts`）：
 * - `sessionBusyError()` → `Session already has an active turn`
 * - `turnPersistenceError()` → `Turn terminal state could not be persisted; session recovery is required.`
 */
export type ResumeFailureKind = "busy" | "recovery_required" | "unknown";

const BUSY_PATTERN = /already has an active turn|\bsession_busy\b/i;
const RECOVERY_PATTERN = /session recovery is required|\brecovery_required\b|\bturn_persistence\b/i;

export function classifyResumeFailure(error: unknown): ResumeFailureKind {
	const text = readErrorText(error);
	if (BUSY_PATTERN.test(text)) return "busy";
	if (RECOVERY_PATTERN.test(text)) return "recovery_required";
	return "unknown";
}

function readErrorText(error: unknown): string {
	if (typeof error === "string") return error;
	if (error instanceof Error) return `${error.name}: ${error.message}`;
	if (typeof error === "object" && error !== null) {
		const message = (error as { message?: unknown }).message;
		if (typeof message === "string") return message;
	}
	return "";
}
