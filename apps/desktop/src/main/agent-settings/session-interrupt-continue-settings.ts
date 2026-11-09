// Copyright The Open Forge contributors.
import { readAgentSettingsDocument, updateAgentSettingsDocument } from "./settings-document-store.js";

export type SessionInterruptMode = "off" | "notify" | "auto";

export interface SessionInterruptContinueSettings {
	readonly mode: SessionInterruptMode;
	readonly maxAttempts: number;
}

/** settings.json 是持久化读入：缺失或损坏时回落到默认 notify / 1。 */
export function getSessionInterruptContinue(): SessionInterruptContinueSettings {
	const raw = readAgentSettingsDocument().sessionInterruptContinue;
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return { mode: "notify", maxAttempts: 1 };
	}
	const mode = (raw as { mode?: unknown }).mode;
	const maxAttempts = (raw as { maxAttempts?: unknown }).maxAttempts;
	return {
		mode: mode === "off" || mode === "notify" || mode === "auto" ? mode : "notify",
		maxAttempts:
			typeof maxAttempts === "number" && Number.isFinite(maxAttempts) && maxAttempts >= 1
				? Math.floor(maxAttempts)
				: 1,
	};
}

/** mode 已由 Host 合同校验；保留其他字段，maxAttempts 固定为 1（与旧 IPC 行为一致）。 */
export function setSessionInterruptContinue(mode: SessionInterruptMode): void {
	updateAgentSettingsDocument((settings) => {
		const prev =
			settings.sessionInterruptContinue &&
			typeof settings.sessionInterruptContinue === "object" &&
			!Array.isArray(settings.sessionInterruptContinue)
				? (settings.sessionInterruptContinue as Record<string, unknown>)
				: {};
		settings.sessionInterruptContinue = { ...prev, mode, maxAttempts: 1 };
	});
}
