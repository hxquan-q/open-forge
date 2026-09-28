// Copyright The Open Forge contributors.

/**
 * 拖拽兜底层广播（TASK-0072）：WebContentsView 等原生图层绘制在 DOM 之上，
 * DOM overlay 拦不住落在 view 上的指针事件。拖拽 overlay 展开/收起时广播，
 * 原生图层的宿主据此切换 `setIgnoreMouseEvents` 让事件穿透回 DOM。
 */
export const OVERLAY_DRAG_EVENT = "vetta:overlay-drag";

export function dispatchOverlayDrag(active: boolean): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new CustomEvent(OVERLAY_DRAG_EVENT, { detail: { active } }));
}
