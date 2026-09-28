import { describe, expect, it } from "vitest";
import { selectTerminalRenderer } from "./select-terminal-renderer";

// BUG-0034 的合同：同一时刻浏览器只能持有十几个 WebGL context，多分屏时
// 只有当前活动格允许占 WebGL，其余一律 canvas；否则分屏/重开会不断累积 context。
describe("selectTerminalRenderer", () => {
	it("只有活动 leaf 用 WebGL，非活动格全部退回 canvas", () => {
		expect(selectTerminalRenderer({ hasWebgl2: true, hardwareAccelerated: true, isActiveLeaf: true })).toBe("webgl");
		expect(selectTerminalRenderer({ hasWebgl2: true, hardwareAccelerated: true, isActiveLeaf: false })).toBe(
			"canvas",
		);
	});

	it("没有 WebGL2 或硬件加速时活动格也只能用 canvas", () => {
		expect(selectTerminalRenderer({ hasWebgl2: false, hardwareAccelerated: true, isActiveLeaf: true })).toBe(
			"canvas",
		);
		expect(selectTerminalRenderer({ hasWebgl2: true, hardwareAccelerated: false, isActiveLeaf: true })).toBe(
			"canvas",
		);
	});

	it("丢过一次 context 后不再回 WebGL，避免再次黑屏", () => {
		expect(
			selectTerminalRenderer({
				hasWebgl2: true,
				hardwareAccelerated: true,
				isActiveLeaf: true,
				contextLost: true,
			}),
		).toBe("canvas");
	});
});
