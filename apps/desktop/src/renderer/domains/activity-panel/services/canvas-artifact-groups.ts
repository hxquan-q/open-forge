// Copyright The Open Forge contributors.
import type { DesktopCanvasArtifactView } from "@preload/api-types/canvas";

export interface CanvasArtifactGroup {
	readonly sessionId: string;
	readonly items: readonly DesktopCanvasArtifactView[];
}

export function groupCanvasArtifactsBySession(
	items: readonly DesktopCanvasArtifactView[],
): readonly CanvasArtifactGroup[] {
	const groups = new Map<string, DesktopCanvasArtifactView[]>();
	for (const item of items) {
		const sessionId = item.descriptor.sourceSessionId;
		const bucket = groups.get(sessionId);
		if (bucket) bucket.push(item);
		else groups.set(sessionId, [item]);
	}
	const sorted = [...groups.entries()].map(([sessionId, grouped]) => ({
		sessionId,
		items: [...grouped].sort((left, right) => right.descriptor.updatedAt - left.descriptor.updatedAt),
	}));
	sorted.sort((left, right) => {
		const leftLatest = left.items[0]?.descriptor.updatedAt ?? 0;
		const rightLatest = right.items[0]?.descriptor.updatedAt ?? 0;
		return rightLatest - leftLatest;
	});
	return sorted;
}

export function resolveCanvasSessionTitle(
	sessionId: string,
	titles: ReadonlyMap<string, string>,
	untitled: string,
): string {
	const title = titles.get(sessionId)?.trim();
	return title && title.length > 0 ? title : untitled;
}
