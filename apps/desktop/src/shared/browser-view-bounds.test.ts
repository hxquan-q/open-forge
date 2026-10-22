// Copyright The Open Forge contributors.

import { describe, expect, it } from "vitest";
import { isReportableBrowserViewBounds, sameBrowserViewBounds } from "./browser-view-bounds.js";

describe("browser view bounds", () => {
	it("宽或高不是正数的矩形不能上报，避免把原生视图压成 0", () => {
		expect(isReportableBrowserViewBounds({ x: 0, y: 0, width: 0, height: 0 })).toBe(false);
		expect(isReportableBrowserViewBounds({ x: 10, y: 10, width: 0, height: 40 })).toBe(false);
		expect(isReportableBrowserViewBounds({ x: 10, y: 10, width: 40, height: -1 })).toBe(false);
		expect(isReportableBrowserViewBounds({ x: 8, y: 40, width: 640, height: 480 })).toBe(true);
	});

	it("原点或尺寸有任一变化就算新矩形，纯平移也要跟着走", () => {
		const origin = { x: 240, y: 80, width: 640, height: 480 };
		expect(sameBrowserViewBounds(origin, { ...origin })).toBe(true);
		expect(sameBrowserViewBounds(origin, { ...origin, x: 8 })).toBe(false);
		expect(sameBrowserViewBounds(origin, { ...origin, width: 700 })).toBe(false);
	});
});
