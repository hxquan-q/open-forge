// Copyright The Open Forge contributors.

/**
 * 团队会话改名失败的归类（BUG-0195）。
 *
 * 宿主经 IPC 只把错误文本透传给渲染端（`code` 字段不跨进程存活），因此按主进程的
 * 稳定文案锚点归类；未命中一律降级为 `unknown`，由调用方显示通用「稍后重试」文案。
 * 版块首页（allstar-dev）与项目侧栏（project）共用本归类，各自落到本域 i18n 文案。
 *
 * 文案锚点（`src/main/agent-teams/team-session-offline-rename.ts`）：
 * - `teamSessionDataFileMissingError()` → `Team session data file is missing: <path>`
 */
export type TeamSessionRenameFailureKind = "data_file_missing" | "unknown";

const DATA_FILE_MISSING_PATTERN = /Team session data file is missing/i;

export function classifyTeamSessionRenameFailure(error: unknown): TeamSessionRenameFailureKind {
	const text = readErrorText(error);
	if (DATA_FILE_MISSING_PATTERN.test(text)) return "data_file_missing";
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
