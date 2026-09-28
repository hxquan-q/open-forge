// Copyright The Open Forge contributors.
import type { ChatErrorKind } from "@shared/conversation";
import type { ChatTimelineItem } from "@shared/store/atoms";

/**
 * 可通过 kernel retry 续跑的错误类别。quota/auth 需要人去设置页处理，给了「继续」
 * 也是必败；这两类保持错误卡上原有的设置引导。
 */
const RESUMABLE_ERROR_KINDS: ReadonlySet<ChatErrorKind> = new Set([
	"rate_limit",
	"network",
	"server",
	"stream_idle",
	"unknown",
]);

export interface InterruptedResumeContext {
	readonly isStreaming: boolean;
	readonly isCompacting: boolean;
}

/**
 * 判定消息列表是否该显示「上次回复未完成 [继续]」条：最后一条助手消息以可恢复的
 * 错误块收尾，且会话当前空闲。更早轮次的失败已被后续正常回复盖过，不再提供入口；
 * 手动停止不产生错误块，天然不会被提示。
 */
export function resolveInterruptedErrorKind(
	messages: readonly ChatTimelineItem[],
	context: InterruptedResumeContext,
): ChatErrorKind | undefined {
	if (context.isStreaming || context.isCompacting) return undefined;
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message.kind !== "agent") continue;
		const lastBlock = message.blocks.at(-1);
		if (lastBlock?.type !== "error") return undefined;
		return RESUMABLE_ERROR_KINDS.has(lastBlock.kind) ? lastBlock.kind : undefined;
	}
	return undefined;
}
