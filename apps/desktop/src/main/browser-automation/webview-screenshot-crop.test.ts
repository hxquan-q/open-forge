// Copyright The Open Forge contributors.
import { BROWSER_SCREENSHOT_MAX_LONG_EDGE_PX } from "@vetta/coding-agent/function-extensions";
import { describe, expect, it } from "vitest";
import { resolveCaptureCrop, scaledScreenshotSize } from "./webview-screenshot-crop.js";

describe("resolveCaptureCrop", () => {
	it("maps CSS viewport rect through devicePixelRatio and ignores scroll offset", () => {
		const crop = resolveCaptureCrop({
			rect: { x: 10, y: 20, width: 100, height: 50 },
			devicePixelRatio: 2,
			imageSize: { width: 1600, height: 1200 },
			scrollOffset: { x: 480, y: 960 },
		});
		expect(crop).toEqual({
			rect: { x: 20, y: 40, width: 200, height: 100 },
			scale: 1,
		});
	});

	it("clamps a partially off-screen rect to the captured bitmap", () => {
		const crop = resolveCaptureCrop({
			rect: { x: -20, y: 80, width: 60, height: 40 },
			devicePixelRatio: 1,
			imageSize: { width: 100, height: 100 },
		});
		expect(crop?.rect).toEqual({ x: 0, y: 80, width: 40, height: 20 });
	});

	it("scales the long edge down to the screenshot cap without stretching", () => {
		const crop = resolveCaptureCrop({
			rect: { x: 0, y: 0, width: 3200, height: 800 },
			devicePixelRatio: 1,
			imageSize: { width: 3200, height: 800 },
		});
		expect(crop?.scale).toBe(BROWSER_SCREENSHOT_MAX_LONG_EDGE_PX / 3200);
		expect(scaledScreenshotSize(crop!)).toEqual({
			width: BROWSER_SCREENSHOT_MAX_LONG_EDGE_PX,
			height: 400,
		});
	});

	it("rejects empty or fully clipped rects", () => {
		expect(
			resolveCaptureCrop({
				rect: { x: 10, y: 10, width: 0, height: 10 },
				devicePixelRatio: 1,
				imageSize: { width: 100, height: 100 },
			}),
		).toBeUndefined();
		expect(
			resolveCaptureCrop({
				rect: { x: 200, y: 200, width: 10, height: 10 },
				devicePixelRatio: 1,
				imageSize: { width: 100, height: 100 },
			}),
		).toBeUndefined();
	});
});
