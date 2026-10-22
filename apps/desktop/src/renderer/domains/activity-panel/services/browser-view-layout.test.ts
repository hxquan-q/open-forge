// Copyright The Open Forge contributors.

import { describe, expect, it } from "vitest";
import { createBrowserViewBoundsSender } from "./browser-view-layout";

describe("createBrowserViewBoundsSender", () => {
	it("窗口连续缩小时丢掉中间宽度，宿主最终只剩下最后一次矩形", async () => {
		const applied: number[] = [];
		let release: (() => void) | undefined;
		const submit = createBrowserViewBoundsSender((bounds) => {
			applied.push(bounds.width);
			return new Promise<void>((resolve) => {
				release = resolve;
			});
		});

		submit({ x: 12, y: 40, width: 900, height: 640 });
		submit({ x: 12, y: 40, width: 700, height: 640 });
		submit({ x: 12, y: 40, width: 520, height: 640 });
		expect(applied).toEqual([900]);

		release?.();
		await Promise.resolve();
		expect(applied).toEqual([900, 520]);
	});
});
