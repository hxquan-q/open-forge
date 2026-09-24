// Copyright The Open Forge contributors.
import { BROWSER_SCREENSHOT_MAX_LONG_EDGE_PX } from "@vetta/coding-agent/function-extensions";

export interface CssRect {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface DeviceSize {
	readonly width: number;
	readonly height: number;
}

export interface CaptureCrop {
	readonly rect: CssRect;
	readonly scale: number;
}

/**
 * Convert a CSS viewport rect into a capturePage crop.
 * getBoundingClientRect is already viewport-relative, so scroll offsets must not be added.
 */
export function resolveCaptureCrop(input: {
	readonly rect: CssRect;
	readonly devicePixelRatio: number;
	readonly imageSize: DeviceSize;
	readonly scrollOffset?: { readonly x: number; readonly y: number };
}): CaptureCrop | undefined {
	void input.scrollOffset;
	const dpr = Number.isFinite(input.devicePixelRatio) && input.devicePixelRatio > 0 ? input.devicePixelRatio : 1;
	if (!(input.rect.width > 0 && input.rect.height > 0)) return undefined;
	if (!(input.imageSize.width > 0 && input.imageSize.height > 0)) return undefined;

	const raw = {
		x: input.rect.x * dpr,
		y: input.rect.y * dpr,
		width: input.rect.width * dpr,
		height: input.rect.height * dpr,
	};
	const left = Math.min(input.imageSize.width, Math.max(0, raw.x));
	const top = Math.min(input.imageSize.height, Math.max(0, raw.y));
	const right = Math.min(input.imageSize.width, Math.max(left, raw.x + raw.width));
	const bottom = Math.min(input.imageSize.height, Math.max(top, raw.y + raw.height));
	const width = right - left;
	const height = bottom - top;
	if (!(width > 0 && height > 0)) return undefined;

	const longEdge = Math.max(width, height);
	const scale = longEdge > BROWSER_SCREENSHOT_MAX_LONG_EDGE_PX ? BROWSER_SCREENSHOT_MAX_LONG_EDGE_PX / longEdge : 1;
	return {
		rect: { x: Math.round(left), y: Math.round(top), width: Math.round(width), height: Math.round(height) },
		scale,
	};
}

export function scaledScreenshotSize(crop: CaptureCrop): DeviceSize {
	return {
		width: Math.max(1, Math.round(crop.rect.width * crop.scale)),
		height: Math.max(1, Math.round(crop.rect.height * crop.scale)),
	};
}
