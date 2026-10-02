// Modified by The Open Forge contributors.
import type { ChatTimelineItem } from "@shared/store/atoms";

/**
 * 未决（live-only）用户气泡的因果锚点归位——BUG-0068 的共享合并管线。
 *
 * transcript-window / chat-message-snapshot 等消费方曾有平行实现；本助手
 * 收编为单一事实源：
 * (a) order 中该气泡之后存在已落在 base 的项 → 锚到第一个后继的 base 位置
 *     之前（气泡夹在持久化项之间，平铺到尾部会跑到它触发的回复之后）；
 * (b) 否则取 order 中最近已落 base 的前驱，锚到 base 中其后第一个 user 项
 *     之前——该位置最可能是它的规范孪生槽；
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
			if (predecessor >= 0) anchor = nextBaseUserIndex(predecessor);
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
