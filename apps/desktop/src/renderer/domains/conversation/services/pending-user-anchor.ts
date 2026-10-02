// Modified by The Open Forge contributors.
import type { ChatTimelineItem } from "@shared/store/atoms";
import { sameUserText } from "./optimistic-user-message-cache";

/**
 * 未决（live-only）用户气泡的因果锚点归位——BUG-0068 的共享合并管线。
 *
 * transcript-window / chat-message-snapshot 等消费方曾有平行实现；本助手
 * 收编为单一事实源：
 * (a) order 中该气泡之后存在已落在 base 的项 → 锚到第一个后继的 base 位置
 *     之前（气泡夹在持久化项之间，平铺到尾部会跑到它触发的回复之后）；
 * (b) 否则取 order 中最近已落 base 的前驱，锚到 base 中其后第一个 user 项
 *     之前——该位置最可能是它的规范孪生槽；槽位 user 文本须与气泡一致
 *     （sameUserText）才落位，否则维持尾部（孪生永不入模的排队幽灵，
 *     BUG-0073）；
 * (c) 都不满足（气泡晚于 base 尾部 / 无已落 base 邻居 / 非 user 项）
 *     → 维持尾部追加。
 *
 * order 中既非 pending 也未落 base 的项被丢弃——窗口化语境下即「已被改写
 * 的 durable 项」，沿用原 reconcile 语义。
 */
export interface CausalAnchorMergeResult {
	/** base 与锚定/尾部 pending 穿插后的完整序列。 */
	readonly items: ChatTimelineItem[];
	/** base[i] 在 items 中的落点下标（span 重映射等按此定位）。 */
	readonly baseIndexes: readonly number[];
}

export interface CausalAnchorMergeInput {
	/** 锚定基准序列（canonical/projected），pending 项穿插在它的条目之间。 */
	readonly base: readonly ChatTimelineItem[];
	/** 承载 pending 项相对顺序的序列（current / live / reconciled）。 */
	readonly order: readonly ChatTimelineItem[];
	/** order 下标是否为待归位的 pending 项。 */
	readonly isPendingIndex: (index: number) => boolean;
	/** order 下标的项已落在 base 中时返回其 base 下标；pending 或无关项返回 undefined。 */
	readonly landedBaseIndex: (index: number) => number | undefined;
}

export function mergeWithCausalAnchors(input: CausalAnchorMergeInput): CausalAnchorMergeResult {
	const { base, order, isPendingIndex, landedBaseIndex } = input;
	const insertBefore = new Map<number, ChatTimelineItem[]>();
	const tailOnly: ChatTimelineItem[] = [];
	const nextBaseUserIndex = (from: number): number => {
		for (let k = from + 1; k < base.length; k += 1) {
			if (base[k].kind === "user") return k;
		}
		return -1;
	};
	for (let i = 0; i < order.length; i += 1) {
		if (!isPendingIndex(i)) continue;
		const item = order[i];
		if (item.kind !== "user") {
			tailOnly.push(item);
			continue;
		}
		let anchor = -1;
		for (let j = i + 1; j < order.length; j += 1) {
			const landed = landedBaseIndex(j);
			if (landed !== undefined) {
				anchor = landed;
				break;
			}
		}
		if (anchor < 0) {
			let predecessor = -1;
			for (let j = i - 1; j >= 0; j -= 1) {
				const landed = landedBaseIndex(j);
				if (landed !== undefined) {
					predecessor = landed;
					break;
				}
			}
			if (predecessor >= 0) {
				// (b) 的依据是「该槽位最可能是它的规范孪生」：锚定槽的 user 文本
				// 必须与气泡一致才落位中段。孪生永远不会出现在该槽位的项（如
				// 取消失败回队留下的未消费排队气泡）插进中段会跑到比它更晚的
				// 已发送消息之前，必须维持尾部（BUG-0073）。
				const slot = nextBaseUserIndex(predecessor);
				const slotItem = slot >= 0 ? base[slot] : undefined;
				if (slotItem && slotItem.kind === "user" && sameUserText(slotItem.text, item.text)) {
					anchor = slot;
				}
			}
		}
		if (anchor >= 0) {
			const group = insertBefore.get(anchor) ?? [];
			group.push(item);
			insertBefore.set(anchor, group);
			continue;
		}
		tailOnly.push(item);
	}
	const items: ChatTimelineItem[] = [];
	const baseIndexes = new Array<number>(base.length);
	for (let i = 0; i < base.length; i += 1) {
		const group = insertBefore.get(i);
		if (group) items.push(...group);
		baseIndexes[i] = items.length;
		items.push(base[i]);
	}
	items.push(...tailOnly);
	return { items, baseIndexes };
}
