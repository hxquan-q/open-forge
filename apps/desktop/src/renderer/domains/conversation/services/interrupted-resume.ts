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
	/**
	 * 会话是否仍有待派发的排队输入。
	 *
	 * 排队派发发生在 `agent_end` 与下一轮 `agent_start` 之间，这一窗口不在主进程的
	 * 运行集（`runningSessionPaths`）内，渲染端的 streaming 信念也会短暂为假。此时续跑条
	 * 可点但内核仍忙碌，点击必被 `SESSION_BUSY` 拒绝（BUG-0122），因此一并作为门控条件。
	 */
	readonly hasPendingQueue: boolean;
}

/**
 * 判定消息列表是否该显示「上次回复未完成 [继续]」条：最后一条助手消息以可恢复的
 * 错误块收尾，且会话当前空闲（无活动轮次、无压缩、无待派发排队输入）。更早轮次的失败
 * 已被后续正常回复盖过，不再提供入口；手动停止不产生错误块，天然不会被提示。
 */
export function resolveInterruptedErrorKind(
	messages: readonly ChatTimelineItem[],
	context: InterruptedResumeContext,
): ChatErrorKind | undefined {
	if (context.isStreaming || context.isCompacting || context.hasPendingQueue) return undefined;
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message.kind !== "agent") continue;
		const lastBlock = message.blocks.at(-1);
		if (lastBlock?.type !== "error") return undefined;
		return RESUMABLE_ERROR_KINDS.has(lastBlock.kind) ? lastBlock.kind : undefined;
	}
	return undefined;
}
