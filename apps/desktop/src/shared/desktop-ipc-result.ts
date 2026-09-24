// Copyright The Open Forge contributors.
/** 跨进程失败的稳定形状；TASK-0059 桩在实现落地前一律返回 `unimplemented`。 */
export const DESKTOP_IPC_UNIMPLEMENTED = "unimplemented" as const;

export interface DesktopIpcUnimplemented {
	readonly ok: false;
	readonly code: typeof DESKTOP_IPC_UNIMPLEMENTED;
	readonly message: string;
}

export function unimplementedDesktopIpcResult(surface: string): DesktopIpcUnimplemented {
	return {
		ok: false,
		code: DESKTOP_IPC_UNIMPLEMENTED,
		message: `${surface} is not implemented`,
	};
}

export function isDesktopIpcUnimplemented(value: unknown): value is DesktopIpcUnimplemented {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return record.ok === false && record.code === DESKTOP_IPC_UNIMPLEMENTED && typeof record.message === "string";
}
