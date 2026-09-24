// Copyright The Open Forge contributors.
import { describe, expect, it } from "vitest";
import { isCanvasTabVisible } from "./canvas-atoms.js";

describe("isCanvasTabVisible", () => {
	it("workspace id 或 cwd 任一指向 canvas 即视为正在看画布", () => {
		const tabs = new Map<string, string>([["/work/app", "canvas"]]);
		expect(isCanvasTabVisible(tabs, ["agent-team:1", "/work/app"])).toBe(true);
		expect(isCanvasTabVisible(tabs, ["/work/app"])).toBe(true);
	});

	it("当前在其它页签或没有键时不视为可见", () => {
		const tabs = new Map<string, string>([["/work/app", "file"]]);
		expect(isCanvasTabVisible(tabs, ["/work/app"])).toBe(false);
		expect(isCanvasTabVisible(tabs, [null, ""])).toBe(false);
	});
});
