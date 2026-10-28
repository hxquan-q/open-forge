// Modified by The Open Forge contributors.
import { atom } from "jotai";

/** 会改文件的写类工具（与 Canvas「任务变更」的口径一致，见 activity-panel/services/session-changes.ts）。 */
const AI_EDIT_TOOLS = new Set(["edit", "edit_file", "write", "write_to_file", "apply_patch", "artifact"]);
const PATH_KEYS = ["file_path", "path", "target_file", "filePath", "file"] as const;

/** AI 最近发起的写类工具调用目标（已解析为绝对路径）。 */
export interface AiEditTarget {
	readonly path: string;
	/** 发起时刻（毫秒），调试用；跟随判定只看 path。 */
	readonly at: number;
}

/**
 * 演示定稿：全局「AI 正在编辑哪个文件」。由两条事件泵写入——普通会话
 * （useSessionEventController 的 tool.start）与团队会话（useTeamChatModel 的
 * agentTeams.subscribe 内层 tool.start），文件页签的热跟随（useFollowAiFileEdits）
 * 只订阅它，与宿主形态（单 agent / agent-team）解耦。
 */
export const aiEditTargetAtom = atom<AiEditTarget | null>(null);

/** 相对路径按会话 cwd 补全，统一为正斜杠（Windows fs 亦可读）；绝对路径规范化分隔符。 */
function toAbsolutePath(cwd: string | null, target: string): string | null {
	const normalized = target.replace(/\\/g, "/");
	if (/^([a-zA-Z]:\/|\/)/.test(normalized)) return normalized;
	if (!cwd) return null;
	return `${cwd.replace(/\\/g, "/").replace(/\/+$/, "")}/${normalized}`;
}

/**
 * 从工具调用事件提取编辑目标：写类工具 + 可识别路径参数 + 可解析为绝对路径才返回。
 * 非写类工具、缺路径或相对路径无 cwd 一律 null（跟随侧按「无目标」处理）。
 */
export function aiEditTargetFromToolCall(
	toolName: string | undefined,
	args: unknown,
	cwd: string | null,
	at: number,
): AiEditTarget | null {
	if (!toolName || !AI_EDIT_TOOLS.has(toolName)) return null;
	const record = (args ?? {}) as Record<string, unknown>;
	for (const key of PATH_KEYS) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) {
			const path = toAbsolutePath(cwd, value.trim());
			return path ? { path, at } : null;
		}
	}
	return null;
}
