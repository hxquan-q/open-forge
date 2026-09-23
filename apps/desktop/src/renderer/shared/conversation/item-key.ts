/**
 * Returns the stable DOM key for a rendered conversation item.
 *
 * Aggregated feeds may contain identical storage ids from separate runtime
 * sessions. `renderKey` disambiguates those items without changing their
 * persisted `id` or `entryId` contracts.
 *
 * 参数刻意保持为最小结构类型：占位 ViewModel（transcript-window）等非完整
 * timeline item 只要保持 id/entryId/renderKey 不变，渲染键即保持一致。
 */
export function conversationItemRenderKey(item: {
	readonly renderKey?: string;
	readonly entryId?: string;
	readonly id: string;
}): string {
	return item.renderKey ?? item.entryId ?? item.id;
}
