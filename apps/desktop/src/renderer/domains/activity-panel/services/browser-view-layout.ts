// Copyright The Open Forge contributors.

import { isReportableBrowserViewBounds, sameBrowserViewBounds } from "@/shared/browser-view-bounds";
import type { DesktopBrowserViewBounds } from "@/shared/browser-view-ipc";

export function readBrowserViewBounds(el: HTMLElement): DesktopBrowserViewBounds {
	const rect = el.getBoundingClientRect();
	return {
		x: Math.round(rect.x),
		y: Math.round(rect.y),
		width: Math.round(rect.width),
		height: Math.round(rect.height),
	};
}

/**
 * 左栏占位宽度一步切到终值，活动面板自身往往只被平移、宽高不变。
 * 只观察占位元素的 `ResizeObserver` 收不到这次平移。
 * 祖先的尺寸变化（主内容区变宽）和浮动页签的 `style` 才会把洞挪走。
 */
export function observeBrowserViewLayout(host: HTMLElement, onChange: () => void): () => void {
	const resizeObserver = new ResizeObserver(onChange);
	let node: HTMLElement | null = host;
	while (node) {
		resizeObserver.observe(node);
		node = node.parentElement;
	}
	const mutationObserver = new MutationObserver(onChange);
	const floating = host.closest("[data-floating-activity-tab]");
	if (floating instanceof HTMLElement) {
		mutationObserver.observe(floating, { attributes: true, attributeFilter: ["style"] });
	}
	const onWindowResize = (): void => {
		onChange();
		// 面板宽度在 resize 之后才由 React 写进 DOM，再量两帧才读得到终值。
		requestAnimationFrame(() => {
			onChange();
			requestAnimationFrame(onChange);
		});
	};
	window.addEventListener("resize", onWindowResize);
	return () => {
		resizeObserver.disconnect();
		mutationObserver.disconnect();
		window.removeEventListener("resize", onWindowResize);
	};
}

/** 返回这一帧应该发给主进程的矩形；隐藏洞和重复矩形返回 null。 */
export function nextBrowserViewBoundsReport(
	previous: DesktopBrowserViewBounds | null,
	measured: DesktopBrowserViewBounds,
): DesktopBrowserViewBounds | null {
	if (!isReportableBrowserViewBounds(measured)) return null;
	if (previous && sameBrowserViewBounds(previous, measured)) return null;
	return measured;
}

/**
 * 窗口拖拽会在一帧里连报多次矩形。`ipc.invoke` 并发返回时，较窄的旧尺寸可能后到，
 * 原生视图就停在那一帧，面板右侧留下空白。这里同时只发一次，在途期间只保留最新矩形。
 */
export function createBrowserViewBoundsSender(
	send: (bounds: DesktopBrowserViewBounds) => Promise<unknown>,
): (bounds: DesktopBrowserViewBounds | null) => void {
	let inflight = false;
	let latest: DesktopBrowserViewBounds | null = null;
	let applied: DesktopBrowserViewBounds | null = null;

	const pump = (): void => {
		if (inflight || !latest) return;
		if (applied && sameBrowserViewBounds(applied, latest)) {
			latest = null;
			return;
		}
		const next = latest;
		latest = null;
		inflight = true;
		void send(next).finally(() => {
			applied = next;
			inflight = false;
			pump();
		});
	};

	return (bounds) => {
		if (!bounds) return;
		latest = bounds;
		pump();
	};
}
