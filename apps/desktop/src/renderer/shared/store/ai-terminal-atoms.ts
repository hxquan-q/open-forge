// Modified by The Open Forge contributors.

import { atom, type getDefaultStore } from "jotai";

/** 会执行 shell 命令的工具——按主仓实际注册名校准（runtime-node coding/tools 的 bash/shell）。 */
const AI_SHELL_TOOLS = new Set(["bash", "shell"]);

/** feed 保留条数上限：超出丢最旧，防长会话内存增长。 */
const MAX_FEED_ENTRIES = 100;
/** 单条输出截断长度（字符），防长输出爆内存。 */
const MAX_OUTPUT_CHARS = 2048;

/** AI 最近执行的 shell 命令回放条目（只读投屏，不驱动真 PTY）。 */
export interface AiTerminalEntry {
	/** 命令文本（截获自 bash/shell 工具调用的 command 参数）。 */
	readonly command: string;
	/** 配对键：普通会话为 toolCallId，团队会话为 aiTerminalTeamKey(...) 生成的前缀键。 */
	readonly key: string;
	/** tool.end 的输出摘要（已截断）；执行中为 undefined。 */
	readonly output?: string;
	/** 是否正在执行（start 后、end 前）。 */
	readonly running: boolean;
	/** 发起时刻（毫秒）。 */
	readonly at: number;
	/** 来源会话 cwd——多会话混流时区分来源，将来按会话隔离用。 */
	readonly cwd: string | null;
}

/**
 * 演示定稿：全局「AI 正在/最近执行哪些 shell 命令」。由两条事件泵写入——普通会话
 * （useSessionEventController 的 tool.start/end）与团队会话（useTeamChatModel 的
 * desktop.team-tool-execution start/end），终端页签的回放面板只订阅它，与宿主形态解耦。
 */
export const aiTerminalFeedAtom = atom<readonly AiTerminalEntry[]>([]);

/**
 * 从 shell 工具调用事件提取命令文本。bash/shell 共用 CommandToolInputSchema，
 * 命令字段固定为 command；非 shell 工具或参数异常返回 null（表现为不投屏，无副作用）。
 */
export function aiTerminalCommandFromToolCall(toolName: string | undefined, args: unknown): string | null {
	if (!toolName || !AI_SHELL_TOOLS.has(toolName)) return null;
	const record = (args ?? {}) as Record<string, unknown>;
	const value = record.command;
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * 从 tool.end 的 result 提取输出摘要。运行时形状是 RuntimeToolResult
 * （content 为 TextContent|ImageContent 数组），拼接全部文本块；兼容纯字符串 result
 * 的防御路径。空输出返回 undefined。
 */
export function aiTerminalOutputFromResult(result: unknown): string | undefined {
	const text = typeof result === "string" ? result : readContentText(result);
	const trimmed = text?.trim();
	return trimmed ? trimmed.slice(0, MAX_OUTPUT_CHARS) : undefined;
}

function readContentText(result: unknown): string | undefined {
	if (!result || typeof result !== "object") return undefined;
	const content = (result as { content?: unknown }).content;
	if (!Array.isArray(content)) return undefined;
	const parts: string[] = [];
	for (const block of content) {
		if (block && typeof block === "object" && (block as { type?: unknown }).type === "text") {
			const text = (block as { text?: unknown }).text;
			if (typeof text === "string" && text.length > 0) parts.push(text);
		}
	}
	return parts.length > 0 ? parts.join("\n") : undefined;
}

/** 团队会话条目的配对键：加会话前缀，避免与其他会话的 toolCallId 撞键误判重。 */
export function aiTerminalTeamKey(conversationId: string, toolCallId: string): string {
	return `${conversationId}:${toolCallId}`;
}

/** start 入队：同 key 幂等（事件重放不重复追加），超限丢最旧。 */
export function pushAiTerminalEntry(store: ReturnType<typeof getDefaultStore>, entry: AiTerminalEntry): void {
	store.set(aiTerminalFeedAtom, (prev) => {
		if (prev.some((e) => e.key === entry.key)) return prev;
		const next = [...prev, entry];
		return next.length > MAX_FEED_ENTRIES ? next.slice(next.length - MAX_FEED_ENTRIES) : next;
	});
}

/** end 配对完成：命中才更新；未知 key 或已完成的 key 返回原数组，泵侧可无条件调用。 */
export function markAiTerminalEntryDone(
	store: ReturnType<typeof getDefaultStore>,
	key: string,
	output: string | undefined,
): void {
	store.set(aiTerminalFeedAtom, (prev) => {
		if (!prev.some((e) => e.key === key && e.running)) return prev;
		return prev.map((e) => (e.key === key ? { ...e, running: false, output } : e));
	});
}
